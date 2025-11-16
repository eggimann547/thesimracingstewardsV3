// analyze-intranet.js
// ---------------------------------------------------------------
// Sim Racing Stewards – Intranet API endpoint
// POST /api/analyze-intranet  { url: "https://youtube.com/..." }
// ---------------------------------------------------------------

import { parseYouTube } from '../../utils/youtube';
import { loadCSV } from '../../utils/csv';
import { applyHeuristics } from '../../utils/heuristics';
import { getRuleQuote } from '../../utils/rules';

const DATASET = await loadCSV('public/simracingstewards_28k.csv');

/**
 * Helper: pick a random phrase from an array
 */
function randomPhrase(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * NEW PHRASE BANKS
 */
const DEFENDER_GAVE_SPACE = [
  'left the door open',
  'gave too much room on the inside',
  'left a gap wide enough for a pass',
  'didn’t cover the inside line'
];

const OVERTAKER_TAKE_SPACE = [
  'close the door',
  'seal the inside line',
  'take the space that’s offered',
  'commit to the gap'
];

/**
 * Generate the explanation + tips based on fault % and context
 */
function buildVerdict({ incident, overlap, contactAvoidable, rule, fault }) {
  const { carA, carB } = fault; // e.g., { carA: "91%", carB: "9%" }

  // ----- Base explanation ------------------------------------------------
  let explanation = '';

  if (incident.toLowerCase().includes('divebomb') || incident.toLowerCase().includes('lunge')) {
    explanation += `Car A attempted a late lunge into the braking zone${
      overlap < 50 ? ' without sufficient overlap' : ''
    }. `;
  }

  if (carA > 70) {
    explanation += `It's the responsibility of the overtaking car to do so safely. Contact was ${
      contactAvoidable ? 'avoidable' : 'unavoidable'
    }.`;
  } else if (carB > 70) {
    explanation += `Car B defended aggressively and ${
      randomPhrase(DEFENDER_GAVE_SPACE)
    }, inviting the incident.`;
  } else {
    explanation += `Both drivers share responsibility — Car A was optimistic, while Car B ${
      randomPhrase(DEFENDER_GAVE_SPACE)
    }.`;
  }

  // ----- Actionable Tips -------------------------------------------------
  const tips = [];

  // Overtaker tip
  if (carA >= 50) {
    tips.push(
      `Overtakers: Brake 10 m earlier when overlap is <50 %. ${randomPhrase(
        OVERTAKER_TAKE_SPACE
      )} only when you have clear space.`
    );
  } else {
    tips.push(
      `Overtakers: You had the right to the space — next time ${randomPhrase(
        OVERTAKER_TAKE_SPACE
      )} decisively.`
    );
  }

  // Defender tip
  if (carB >= 30) {
    tips.push(
      `Defenders: Hold your racing line firmly. Don't ${randomPhrase(
        DEFENDER_GAVE_SPACE
      )}.`
    );
  } else {
    tips.push(`Defenders: Stay predictable. No need to yield if overlap exists.`);
  }

  const tipBlock = tips.map(t => `• ${t}`).join('\n');

  // ----- Spotter-style advice --------------------------------------------
  const spotter = overlap >= 50
    ? `Spotter call: "Overlap achieved — ${randomPhrase(OVERTAKER_TAKE_SPACE)}!"`
    : `Spotter call: "No overlap — brake or bail!"`;

  // ----- Confidence -------------------------------------------------------
  const confidence = rule && incident.matchCount >= 3 ? 'High' : 'Medium';

  // ----- Assemble final JSON ----------------------------------------------
  return {
    rule: rule ? `${rule.title} (${rule.source} Rule ${rule.id})` : 'Heuristic only',
    fault: { 'Car A': `${carA}%`, 'Car B': `${carB}%` },
    explanation: `${explanation}\n\n${tipBlock}`,
    overtake_tip: `Establish overlap before the apex — never dive into the 'Vortex of Danger'.`,
    defend_tip: `Stay predictable. Don't weave — just hold your line.`,
    spotter_advice: spotter,
    confidence
  };
}

/**
 * Main handler
 */
export async function POST(req) {
  const { url } = await req.json();

  if (!url?.includes('youtube.com') && !url?.includes('youtu.be')) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. Parse video + extract metadata (title, timestamps, etc.)
    const video = await parseYouTube(url);
    const incidentKeywords = extractKeywords(video.title);

    // 2. Match against CSV dataset
    const matches = DATASET.filter(row =>
      incidentKeywords.some(k => row.tags.includes(k))
    ).slice(0, 5);

    // Add matchCount to incident for confidence logic
    video.matchCount = matches.length;

    // 3. Apply heuristics (overlap %, speed delta, etc.)
    const heuristics = await applyHeuristics(video);

    // 4. Pull exact rule
    const rule = getRuleQuote(incidentKeywords, heuristics);

    // 5. Fault calculation (40% CSV + 40% Rules + 20% Heuristics)
    const fault = calculateFault(matches, rule, heuristics);

    // 6. Build final verdict
    const verdict = buildVerdict({
      incident: video.title,
      overlap: heuristics.overlapPercent,
      contactAvoidable: heuristics.contactAvoidable,
      rule,
      fault
    });

    return new Response(JSON.stringify(verdict), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Analysis failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Stub helpers – replace with your real implementations
 */
function extractKeywords(title) {
  const lower = title.toLowerCase();
  return [
    'divebomb',
    'punting',
    'unsafe rejoin',
    'blocking',
    'overlap',
    't1',
    'braking'
  ].filter(k => lower.includes(k));
}

function calculateFault(matches, rule, heuristics) {
  // Simplified – your real engine lives here
  const csvWeight = matches.length * 8; // 40%
  const ruleWeight = rule ? 40 : 0; // 40%
  const heurWeight = heuristics.overlapPercent < 30 ? 20 : 10; // 20%

  const total = csvWeight + ruleWeight + heurWeight;
  const carA = Math.round((csvWeight + heurWeight) / total * 100);
  return { carA, carB: 100 - carA };
}
