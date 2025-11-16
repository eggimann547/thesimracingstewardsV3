// api/analyze-intranet.js
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

    // -------------------------------------------------
    // 1. Extract YouTube ID + Title
    // -------------------------------------------------
    const videoId = url.match(/(?:v=|\/embed\/|\/watch\?v=|\/shorts\/)([0-9A-Za-z_-]{11})/)?.[1];
    if (!videoId) throw new Error('Invalid YouTube URL');

    let title = 'unknown incident';
    let isNASCAR = false;
    let incidentType = 'general contact';

    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`, {
        signal: controller.signal
      });
      if (oembed.ok) {
        const data = await oembed.json();
        title = data.title || 'unknown';
      }
    } catch (e) {
      console.log('oEmbed failed:', e);
    }

    const lower = title.toLowerCase();
    if (lower.includes('nascar')) {
      isNASCAR = true;
      incidentType = 'oval contact (NASCAR)';
    } else if (lower.includes('formula') || lower.includes('vee')) {
      incidentType = 'divebomb';
    } else if (lower.includes('dive') || lower.includes('bomb')) {
      incidentType = 'divebomb';
    } else if (lower.includes('vortex')) {
      incidentType = 'vortex exit';
    }

    console.log('DEBUG: Title:', title, '| Type:', incidentType, '| NASCAR:', isNASCAR);

    // -------------------------------------------------
    // 2. Load Dataset
    // -------------------------------------------------
    let matches = [];
    let datasetAvgFaultA = isNASCAR ? 65 : 81;

    try {
      const csvPath = path.join(process.cwd(), 'public', 'simracingstewards_28k.csv');
      const text = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(text, { header: true }).data;
      const query = lower;

      for (const row of parsed) {
        if (!row.title || !row.reason) continue;
        const rowText = `${row.title} ${row.reason}`.toLowerCase();
        let score = query.split(' ').filter(w => rowText.includes(w)).length;
        if (rowText.includes(incidentType.replace(' (NASCAR)', ''))) score += 3;
        if (score > 0) matches.push({ ...row, score });
      }

      matches.sort((a, b) => b.score - a.score);
      matches = matches.slice(0, 5);

      const validFaults = matches
        .map(m => parseFloat(m.fault_pct_driver_a || 0))
        .filter(f => !isNaN(f));
      datasetAvgFaultA = validFaults.length > 0
        ? Math.round(validFaults.reduce((a, b) => a + b, 0) / validFaults.length)
        : datasetAvgFaultA;

      console.log('DEBUG: Matches:', matches.length, 'Fault A:', datasetAvgFaultA);
    } catch (e) {
      console.log('CSV load failed:', e);
    }

    const confidence = matches.length >= 3 ? 'High' : matches.length >= 1 ? 'Medium' : 'Low';

    // -------------------------------------------------
    // 3. Rules
    // -------------------------------------------------
    const rulesSection = isNASCAR
      ? `NASCAR RULES:
1. NASCAR 10.8.3: Stay above yellow line.
2. Inside Line Priority: Car in bottom groove has right to corner.`
      : `GENERAL RULES:
1. iRacing 8.1.1.8: No advantage off track.
2. SCCA: Overtaker must be alongside at apex.`;

    // -------------------------------------------------
    // 4. PROMPT – NO EXAMPLE JSON, FULL ANALYSIS
    // -------------------------------------------------
    const prompt = `You are a professional sim racing steward. Analyze the incident in this YouTube video:

VIDEO TITLE: "${title}"
INCIDENT TYPE: ${incidentType}
NASCAR: ${isNASCAR ? 'YES' : 'NO'}
DATASET BASELINE: ${datasetAvgFaultA}% fault on overtaking car (Car A)

RULES:
${rulesSection}

Use these phrases naturally:
- Dive bomb
- Vortex of Danger
- left the door open
- he was never going to make that pass
- you aren't required to leave the door open
- a lunge at the last second does not mean you have to give him space
- its the responsibility of the overtaking car to do so safely
- you didn't have space to make that move
- turn off the racing line

DO NOT say "like a champ", "pull the pin", or repeat the same phrase every time.

OUTPUT ONLY VALID JSON:
{
  "rule": "quote one rule",
  "fault": { "Car A": "XX%", "Car B": "XX%" },
  "car_identification": "Car A: Overtaker. Car B: Defender.",
  "explanation": "3-4 sentences describing what happened, why, and a teaching point.",
  "overtake_tip": "One tip for Car A.",
  "defend_tip": "One tip for Car B.",
  "spotter_advice": { "overtaker": "...", "defender": "..." },
  "confidence": "${confidence}",
  "flags": ["divebomb", "contact"]
}`;

    // -------------------------------------------------
    // 5. Call Grok
    // -------------------------------------------------
    const grok = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7,   // Higher = more creative, unique
        top_p: 0.9
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!grok.ok) throw new Error(`Grok error: ${grok.status}`);

    const data = await grok.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    // -------------------------------------------------
    // 6. Parse with Fallback
    // -------------------------------------------------
    let verdict = {
      rule: isNASCAR ? 'NASCAR Inside Line Priority' : 'iRacing 8.1.1.8',
      fault: { 'Car A': `${datasetAvgFaultA}%`, 'Car B': `${100 - datasetAvgFaultA}%` },
      car_identification: 'Car A: Overtaker. Car B: Defender.',
      explanation: `Car A attempted a late move. Contact occurred. Overtake safely.`,
      overtake_tip: 'Build overlap first.',
      defend_tip: 'Hold your line.',
      spotter_advice: { overtaker: 'Wait for clear.', defender: 'Call inside!' },
      confidence,
      flags: [incidentType.replace(/ /g, '_').toLowerCase()]
    };

    try {
      const parsed = JSON.parse(raw);
      verdict = { ...verdict, ...parsed };
      verdict.fault = parsed.fault || verdict.fault;
    } catch (e) {
      console.log('JSON parse failed:', e);
    }

    return Response.json({ verdict, matches, isNASCAR });

  } catch (err) {
    clearTimeout(timeout);
    return Response.json({
      verdict: {
        rule: 'Error',
        fault: { 'Car A': '0%', 'Car B': '0%' },
        explanation: `Error: ${err.message}`,
        confidence: 'N/A'
      }
    }, { status: 500 });
  }
}
