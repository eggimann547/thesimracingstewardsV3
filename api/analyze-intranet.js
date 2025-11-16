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
    // 1. YouTube title + NASCAR detection
    // -------------------------------------------------
    const videoId = url.match(/v=([0-9A-Za-z_-]{11})/)?.[1] || '';
    let title = 'unknown incident';
    let incidentType = 'general contact';
    let isNASCAR = false;

    if (videoId) {
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=${url}&format=json`,
          { signal: controller.signal }
        );
        if (oembed.ok) {
          const data = await oembed.json();
          title = data.title || 'unknown';
        }
        const lower = title.toLowerCase();

        if (lower.includes('nascar')) {
          isNASCAR = true;
          console.log('DEBUG: NASCAR detected – Title:', title);
        }

        if (lower.includes('dive') || lower.includes('brake')) incidentType = 'divebomb';
        else if (lower.includes('vortex') || lower.includes('exit')) incidentType = 'vortex exit';
        else if (lower.includes('weave') || lower.includes('block')) incidentType = 'weave block';
        else if (lower.includes('rejoin') || lower.includes('spin')) incidentType = 'unsafe rejoin';
        else if (lower.includes('apex') || lower.includes('cut')) incidentType = 'track limits';

        if (isNASCAR && !incidentType.includes('NASCAR')) {
          incidentType = `${incidentType} (NASCAR)`;
        }
        console.log('DEBUG: incidentType:', incidentType, 'isNASCAR:', isNASCAR);
      } catch (e) {
        console.log('YouTube oembed failed:', e);
      }
    }

    // -------------------------------------------------
    // 2. Load CSV from /public (Vercel-safe)
    // -------------------------------------------------
    let matches = [];
    let datasetAvgFaultA = 81;
    try {
      // Vercel bundles /public → accessible via process.cwd()
      const csvPath = path.join(process.cwd(), 'public', 'simracingstewards_28k.csv');
      const text = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(text, { header: true }).data;
      const query = title.toLowerCase();

      for (const row of parsed) {
        if (!row.title || !row.reason) continue;
        const rowText = `${row.title} ${row.reason}`.toLowerCase();
        let score = query.split(' ').filter(w => rowText.includes(w)).length;
        if (rowText.includes(incidentType.replace(' (NASCAR)', ''))) score += 2;
        if (score > 0) matches.push({ ...row, score });
      }

      matches.sort((a, b) => b.score - a.score);
      matches = matches.slice(0, 5);

      const validFaults = matches
        .map(m => parseFloat(m.fault_pct_driver_a || 0))
        .filter(f => !isNaN(f) && f >= 0);
      datasetAvgFaultA = validFaults.length > 0
        ? Math.round(validFaults.reduce((a, b) => a + b, 0) / validFaults.length)
        : isNASCAR ? 65 : 81;

      console.log(
        'DEBUG: CSV loaded – matches:',
        matches.length,
        'avgFaultA:',
        datasetAvgFaultA
      );
    } catch (e) {
      console.log('CSV load failed:', e);
    }

    const datasetNote = matches.length
      ? `Dataset: ${matches.length}/5 matches. Avg Car A fault: ${datasetAvgFaultA}%. Top: "${matches[0].title}" (${matches[0].ruling})`
      : `Dataset: No matches. Using default for ${incidentType}: ~${datasetAvgFaultA}% Car A fault`;

    const confidence = matches.length >= 3 ? 'High' : matches.length >= 1 ? 'Medium' : 'Low';

    // -------------------------------------------------
    // 3. Rules (NASCAR vs General)
    // -------------------------------------------------
    const rulesSection = isNASCAR
      ? `NASCAR RULES (MANDATORY – QUOTE FROM THESE):
1. NASCAR 10.8.3 (Yellow Line): "Vehicles must race above the double yellow lines. Below to gain position = black flag."
2. NASCAR Inside Line Priority: "Car establishing inside/bottom groove has right to corner. Minor contact in packs often shared."`
      : `GENERAL RULES (MANDATORY – QUOTE FROM THESE):
1. iRacing 8.1.1.8: "A driver may not gain an advantage by leaving the racing surface or racing below the white line."
2. SCCA Appendix P: "Overtaker must be alongside at apex. One safe move only."`;

    // -------------------------------------------------
    // 4. Prompt – LONGER EXPLANATION + STRICT TONE
    // -------------------------------------------------
    const prompt = `You are a friendly, neutral sim racing steward. Use ONLY these racing phrases:
- "turned in like you weren’t even there"
- "used you as a guardrail"
- "held the line like a champ"
- "divebombed the chicane"
- "locked up and collected"

**DO NOT USE**: "pulled the pin", "yeetin’", "ain’t", "mate", "no BS", "sloppy meat".

**FAULT BASELINE (MUST FOLLOW)**
${datasetNote}
FAULT SPLIT: ${datasetAvgFaultA}% Car A / ${100 - datasetAvgFaultA}% Car B  
(adjust ±20% max only if video clearly contradicts; must sum 100%).

INCIDENT:
- Video: ${url}
- Title: "${title}"
- Type: ${incidentType}

RULES (Quote 1-2 from below):
${rulesSection}

OUTPUT **ONLY** VALID JSON (no extra text). Explanation must be 3–4 sentences:
1. What Car A did
2. What Car B did
3. Why contact occurred
4. Key teaching point

{
  "rule": "${isNASCAR ? "NASCAR Inside Line Priority" : "iRacing 8.1.1.8"}",
  "fault": { "Car A": "${datasetAvgFaultA}%", "Car B": "${100 - datasetAvgFaultA}%" },
  "car_identification": "Car A: Overtaker. Car B: Defender.",
  "explanation": "${isNASCAR 
    ? "Car A dove to the bottom groove late in the corner, attempting to pass underneath Car B. Car B was already committed to the low line and held their position. Because Car A did not establish a clean inside run, the cars made contact in the middle of the turn. In NASCAR, the driver who sets the bottom groove has priority—Car A should have waited for a safer opportunity."
    : "Car A initiated a late braking move into the apex, turning in sharply without sufficient overlap. Car B was already on the racing line and maintained their path. The lack of overlap caused Car A’s front to clip Car B’s rear. Overtaking requires at least 50% overlap at turn-in to claim space safely."}",
  "overtake_tip": "${isNASCAR ? "Wait for a clean low-line pass—lift early if overlap isn’t there." : "Brake earlier and build overlap before turning in."}",
  "defend_tip": "${isNASCAR ? "Protect the bottom groove when spotter calls ‘car low!’." : "Hold your line firmly when under pressure."}",
  "spotter_advice": {
    "overtaker": "${isNASCAR ? "Wait for ‘clear low’ before diving." : "Listen for ‘clear inside’ before committing."}",
    "defender": "${isNASCAR ? "Call ‘car low!’ early and guard the groove." : "React to ‘car inside!’ and stay predictable."}"
  },
  "confidence": "${confidence}",
  "flags": ["${incidentType.replace(/ /g, '_').toLowerCase()}"]
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
        max_tokens: 700,
        temperature: 0.15,
        top_p: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!grok.ok) throw new Error(`Grok API error: ${grok.status}`);

    const data = await grok.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    // -------------------------------------------------
    // 6. Parse + Fallback
    // -------------------------------------------------
    let verdict = {
      rule: isNASCAR ? 'NASCAR Inside Line Priority' : 'iRacing 8.1.1.8',
      fault: { 'Car A': `${datasetAvgFaultA}%`, 'Car B': `${100 - datasetAvgFaultA}%` },
      car_identification: 'Car A: Overtaker. Car B: Defender.',
      explanation: isNASCAR
        ? "Contact occurred on an oval due to a late inside move. Car A failed to clear the low line. Car B had priority. Wait for a clean pass."
        : "Contact during a late overtake. Car A turned in without overlap. Car B held the line. Build overlap first.",
      overtake_tip: isNASCAR ? 'Secure low line early.' : 'Wait for overlap.',
      defend_tip: isNASCAR ? 'Guard the groove.' : 'Stay predictable.',
      spotter_advice: {
        overtaker: isNASCAR ? "Await 'clear low'." : "Listen for 'clear inside'.",
        defender: isNASCAR ? "Call 'car low!'." : "React to 'car inside!'."
      },
      confidence,
      flags: isNASCAR ? ['oval_contact', 'nascar'] : [incidentType.replace(/ /g, '_')]
    };

    try {
      const parsed = JSON.parse(raw);
      const a = parseInt((parsed.fault?.['Car A'] || '').replace('%', ''));
      const b = parseInt((parsed.fault?.['Car B'] || '').replace('%', ''));
      const sumValid = !isNaN(a) && !isNaN(b) && a + b === 100;

      verdict = {
        rule: parsed.rule || verdict.rule,
        fault: sumValid ? parsed.fault : verdict.fault,
        car_identification: parsed.car_identification || verdict.car_identification,
        explanation: parsed.explanation || verdict.explanation,
        overtake_tip: parsed.overtake_tip || verdict.overtake_tip,
        defend_tip: parsed.defend_tip || verdict.defend_tip,
        spotter_advice: parsed.spotter_advice || verdict.spotter_advice,
        confidence: parsed.confidence || confidence,
        flags: Array.isArray(parsed.flags) ? parsed.flags : verdict.flags
      };
    } catch (e) {
      console.log('JSON parse failed, using fallback:', e);
    }

    console.log('DEBUG: Final rule:', verdict.rule, 'Fault A:', verdict.fault['Car A']);

    return Response.json({ verdict, matches, isNASCAR });

  } catch (err) {
    clearTimeout(timeout);
    return Response.json(
      {
        verdict: {
          rule: 'Analysis Error',
          fault: { 'Car A': '0%', 'Car B': '0%' },
          car_identification: '',
          explanation: `Error: ${err.message}`,
          overtake_tip: '',
          defend_tip: '',
          spotter_advice: { overtaker: '', defender: '' },
          confidence: 'N/A',
          flags: []
        },
        matches: [],
        isNASCAR: false
      },
      { status: 500 }
    );
  }
}
