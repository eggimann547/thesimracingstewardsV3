// pages/api/analyze-intranet.js
// Version: December 03, 2025 — Title Context Edition (no API key needed)

import { z } from 'zod';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const schema = z.object({
  url: z.string().url(),
  incidentType: z.string().min(1),
  carA: z.string().optional().default(""),
  carB: z.string().optional().default(""),
  stewardNotes: z.string().optional().default(""),
  overrideFaultA: z.coerce.number().min(0).max(100).optional().nullable()
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const timeout = setTimeout(() => res.status(504).json({ error: "Timeout" }), 28000);

  try {
    const body = req.body;
    const {
      url,
      incidentType: userType,
      carA = "",
      carB = "",
      stewardNotes = "",
      overrideFaultA = null
    } = schema.parse(body);

    const humanInput = stewardNotes.trim();

    // 1. Extract video ID + fetch title via oEmbed (no API key!)
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([0-9A-Za-z_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (!videoId) throw new Error("Invalid YouTube URL");

    let title = "Sim racing incident";
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`, { signal: AbortSignal.timeout(5000) });
      if (oembed.ok) {
        const data = await oembed.json();
        title = data.title || title;
      }
    } catch (e) {
      console.warn("Title fetch failed, using fallback");
    }

    // 2. Incident type → internal key
    const typeMap = {
      "Divebomb / Late lunge": "divebomb",
      "Weave / Block / Defending move": "weave block",
      "Unsafe rejoin": "unsafe rejoin",
      "Vortex exit / Draft lift-off": "vortex exit",
      "Netcode / Lag / Teleport": "netcode",
      "Used as a barrier / Squeeze": "used as barrier",
      "Pit-lane incident": "pit-lane incident",
      "Start-line chaos / T1 pile-up": "t1 chaos",
      "Intentional wreck / Revenge": "intentional wreck",
      "Racing incident (no fault)": "racing incident",
      "Crowd-strike / Accordion effect": "accordion",
      "Blocking while being lapped": "blue flag block",
      "Blue-flag violation / Ignoring blue flags": "blue flag",
      "Brake test": "brake test",
      "Cutting the track / Track limits abuse": "track limits",
      "False start / Jump start": "jump start",
      "Illegal overtake under SC/VSC/FCY": "illegal overtake sc",
      "Move under braking": "move under braking",
      "Over-aggressive defense (2+ moves)": "aggressive defense",
      "Punt / Rear-end under braking": "punt",
      "Re-entry after off-track (gaining advantage)": "rejoin advantage",
      "Side-by-side contact mid-corner": "side contact",
      "Track rejoin blocking racing line": "rejoin block",
      "Unsportsmanlike conduct / Chat abuse": "unsportsmanlike",
      "Wrong way / Ghosting violation": "wrong way"
    };
    const incidentKey = typeMap[userType] || "general contact";

    // 3. Load CSV + find best matches (title now helps gently)
    let matches = [];
    let finalFaultA = 60;
    let confidence = "Low";

    if (overrideFaultA !== null) {
      finalFaultA = Math.round(overrideFaultA);
      confidence = "Human Override";
    } else {
      const csvPath = path.join(process.cwd(), 'public', 'simracingstewards_28k.csv');
      const text = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(text, { header: true }).data;

      const titleWords = title.toLowerCase().match(/\w+/g) || [];
      const inputWords = humanInput.toLowerCase().match(/\w+/g) || [];

      for (const row of parsed) {
        if (!row.title) continue;
        const rowText = `${row.title} ${row.reason || ''} ${row.ruling || ''}`.toLowerCase();
        let score = 0;

        if (rowText.includes(incidentKey)) score += 15;
        inputWords.slice(0, 10).forEach(w => { if (rowText.includes(w)) score += 3; });
        titleWords.slice(0, 6).forEach(w => { if (rowText.includes(w)) score += 1; }); // gentle title boost

        if (score > 0) matches.push({ ...row, score });
      }

      matches.sort((a, b) => b.score - a.score);
      matches = matches.slice(0, 5);

      const valid = matches.map(m => parseFloat(m.fault_pct_driver_a)).filter(n => !isNaN(n));
      const avgFromCsv = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 60;

      finalFaultA = Math.round(avgFromCsv * 0.75 + 50 * 0.25); // 75% precedent, 25% neutral
      confidence = matches.length >= 4 ? "Very High" : matches.length >= 2 ? "High" : matches.length >= 1 ? "Medium" : "Low";
    }

    finalFaultA = Math.min(98, Math.max(2, finalFaultA));

    // 4. Pro tip from tips2.txt
    let proTip = "Both drivers can improve situational awareness.";
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const tipRes = await fetch(`${baseUrl}/tips2.txt`, { signal: AbortSignal.timeout(5000) });
      if (tipRes.ok) {
        const lines = (await tipRes.text()).split('\n').filter(l => l.includes('|'));
        const candidates = lines.filter(l => l.toLowerCase().includes(incidentKey));
        if (candidates.length) proTip = candidates[Math.floor(Math.random() * candidates.length)].split('|')[0].trim();
      }
    } catch {}

    // 5. Car roles
    let carARole = "the overtaking car";
    let carBRole = "the defending car";
    switch (incidentKey) {
      case "weave block": [carARole, carBRole] = ["the defending car", "the overtaking car"]; break;
      case "unsafe rejoin": [carARole, carBRole] = ["the rejoining car", "the on-track car"]; break;
      case "netcode": [carARole, carBRole] = ["the teleporting car", "the affected car"]; break;
      case "brake test": [carARole, carBRole] = ["the braking car", "the following car"]; break;
      case "racing incident": [carARole, carBRole] = ["Car A", "Car B"]; break;
    }

    const carAId = carA ? ` (${carA.trim()})` : "";
    const carBId = carB ? ` (${carB.trim()})` : "";
    const carIdentification = `Car A${carAId} is ${carARole}. Car B${carBId} is ${carBRole}.`;

    // 6. Final Grok prompt — now includes title context
    const humanContext = humanInput ? `HUMAN STEWARD NOTES (must be reflected verbatim):\n"${humanInput}"\n\n` : "";
    const titleContext = `SUBMITTER'S TITLE PERSPECTIVE: "${title}"\n(Use only for subtle context — never contradict steward notes)\n\n`;

    const prompt = `${humanContext}${titleContext}You are a senior, neutral sim-racing steward.

Incident type: ${userType}
${carIdentification}
Fault split: Car A${carAId} ${finalFaultA}% — Car B${carBId} ${100 - finalFaultA}%
Confidence: ${confidence}

Write a calm, professional 3–5 sentence verdict.
Start with: "In this ${userType.toLowerCase()}..."
End with this exact pro tip: "${proTip}"

Return ONLY valid JSON with these keys:
{
  "rule": "relevant rule",
  "fault": { "Car A${carAId}": "${finalFaultA}%", "Car B${carBId}": "${100-finalFaultA}%" },
  "car_identification": "${carIdentification}",
  "explanation": "3–5 sentences",
  "pro_tip": "${proTip}",
  "confidence": "${confidence}"
}`;

    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 700,
        temperature: 0.7
      })
    });

    clearTimeout(timeout);
    const data = await grokRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}';

    let verdict = {
      rule: "iRacing Sporting Code / LFM Regulations",
      fault: { [`Car A${carAId}`]: `${finalFaultA}%`, [`Car B${carBId}`]: `${100-finalFaultA}%` },
      car_identification: carIdentification,
      explanation: `In this ${userType.toLowerCase()}, contact occurred. ${proTip}`,
      pro_tip: proTip,
      confidence
    };

    try { Object.assign(verdict, JSON.parse(raw)); } catch {}

    res.status(200).json({ verdict, matches: matches.slice(0, 5) });

  } catch (err) {
    clearTimeout(timeout);
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
