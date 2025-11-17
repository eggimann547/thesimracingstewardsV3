// api/analyze-intranet.js
// LAST 100% KNOWN-WORKING VERSION – REVERT TO THIS NOW
import { z } from 'zod';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const schema = z.object({ url: z.string().url() });

export async function POST(req) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const { url } = schema.parse(await req.json());

    // 1. YouTube title
    const videoId = url.match(/v=([0-9A-Za-z_-]{11})/)?.[1] || url.match(/youtu\.be\/([0-9A-Za-z_-]{11})/)?.[1] || '';
    let title = 'incident';
    if (videoId) {
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`, { signal: controller.signal });
        if (oembed.ok) title = (await oembed.json()).title || 'incident';
      } catch (e) {}
    }

    const lower = title.toLowerCase();
    let incidentType = 'general contact';
    if (lower.includes('dive') || lower.includes('brake')) incidentType = 'divebomb';
    else if (lower.includes('vortex') || lower.includes('exit')) incidentType = 'vortex exit';
    else if (lower.includes('weave') || lower.includes('block')) incidentType = 'weave block';
    else if (lower.includes('rejoin') || lower.includes('spin')) incidentType = 'unsafe rejoin';
    else if (lower.includes('netcode') || lower.includes('lag')) incidentType = 'netcode';

    // 2. CSV matching + fault
    let matches = [];
    let finalFaultA = 60;
    try {
      const csvPath = path.join(process.cwd(), 'public', 'simracingstewards_28k.csv');
      const text = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(text, { header: true }).data;
      const queryWords = title.toLowerCase().split(' ').filter(w => w.length > 2);

      for (const row of parsed) {
        if (!row.title) continue;
        const rowText = `${row.title} ${row.reason || ''}`.toLowerCase();
        let score = 0;
        queryWords.forEach(w => { if (rowText.includes(w)) score += 3; });
        if (rowText.includes(incidentType)) score += 5;
        if (score > 0) matches.push({ ...row, score });
      }
      matches.sort((a, b) => b.score - a.score);
      matches = matches.slice(0, 5);

      const validFaults = matches.map(m => parseFloat(m.fault_pct_driver_a)).filter(f => !isNaN(f));
      const csvFaultA = validFaults.length > 0 ? validFaults.reduce((a, b) => a + b, 0) / validFaults.length : 60;
      finalFaultA = Math.round(csvFaultA * 0.6 + 70 * 0.4);
    } catch (e) {}

    finalFaultA = Math.min(98, Math.max(5, finalFaultA));
    const confidence = matches.length >= 3 ? 'High' : matches.length >= 1 ? 'Medium' : 'Low';

    // 3. Random tip from tips2.txt
    let proTip = "Both drivers can improve situational awareness.";
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/tips2.txt`, { signal: controller.signal });
      if (res.ok) {
        const lines = (await res.text()).split('\n').map(l => l.trim()).filter(l => l && l.includes('|'));
        if (lines.length > 0) {
          const randomLine = lines[Math.floor(Math.random() * lines.length)];
          proTip = randomLine.split('|')[0].trim();
        }
      }
    } catch (e) {}

    // 4. Car identification – exactly what your frontend expects
    let carA = "Overtaker", carB = "Defender";
    if (incidentType === 'weave block') { carA = "Defender"; carB = "Overtaker"; }
    else if (incidentType === 'unsafe rejoin') { carA = "Rejoining car"; carB = "On-track car"; }
    else if (incidentType === 'netcode') { carA = "Teleporting car"; carB = "Affected car"; }

    const carIdentification = `Car A is ${carA.toLowerCase()}. Car B is ${carB.toLowerCase()}.`;

    // 5. Grok prompt
    const prompt = `You are a neutral sim racing steward.
Video: ${url}
Title: "${title}"
Incident type: ${incidentType}
${carIdentification}
Fault: Car A ${finalFaultA}%, Car B ${100-finalFaultA}%
Confidence: ${confidence}
Include tip: "${proTip}"
Return ONLY valid JSON with this exact structure:
{
  "rule": "iRacing Sporting Code section",
  "fault": { "Car A": "${finalFaultA}%", "Car B": "${100-finalFaultA}%" },
  "car_identification": "${carIdentification}",
  "explanation": "3-4 sentence neutral summary",
  "overtake_tip": "tip for overtaker",
  "defend_tip": "tip for defender",
  "spotter_advice": { "overtaker": "...", "defender": "..." },
  "confidence": "${confidence}"
}`;

    const grok = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'grok-3', messages: [{ role: 'user', content: prompt }], max_tokens: 600 }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!grok.ok) throw new Error('Grok failed');

    const data = await grok.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    let verdict = {
      rule: "iRacing Sporting Code",
      fault: { "Car A": `${finalFaultA}%`, "Car B": `${100-finalFaultA}%` },
      car_identification: carIdentification,
      explanation: `Incident classified as ${incidentType}. ${proTip}`,
      overtake_tip: "Brake earlier when no overlap.",
      defend_tip: "Hold your line.",
      spotter_advice: { overtaker: "Listen to spotter.", defender: "React fast." },
      confidence
    };

    try { verdict = { ...verdict, ...JSON.parse(raw) }; } catch (e) {}

    verdict.explanation += `\n\n${proTip}`;

    return Response.json({ verdict, matches });
  } catch (err) {
    clearTimeout(timeout);
    return Response.json({
      verdict: {
        rule: "Error", fault: { "Car A": "0%", "Car B": "0%" },
        car_identification: "Error determining roles",
        explanation: "Server error – please try again",
        overtake_tip: "", defend_tip: "", spotter_advice: { overtaker: "", defender: "" },
        confidence: "N/A"
      },
      matches: []
    }, { status: 500 });
  }
}
