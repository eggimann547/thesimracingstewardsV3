The Sim Racing Stewards User Manual
Fair. Fast. Fun. Unbiased. Community-Powered.
thesimracingstewards.com | November 16, 2025

Welcome to The Sim Racing Stewards
The Sim Racing Stewards is your neutral, educational, and community-driven platform for analyzing sim racing incidents — without drama, without bias, with clarity.
We’re not here to shame drivers.
We’re here to teach, improve, and keep racing fun.

What We Do

Paste a YouTube link →
Get a full steward verdict in seconds:
Rule quote
Fault % (Car A vs Car B)
Clear explanation
Actionable tips
Spotter advice
Confidence level


All powered by historical data, real rulebooks, and AI — but always human-reviewed.

How It Works (For Users)
Step 1: Submit a Video

Go to thesimracingstewards.com
Paste a YouTube link (public or unlisted)
Click "Analyze Incident"

Pro Tip: Use a clear title like:
Divebomb into T1 - Was overlap achieved?
Unsafe rejoin after spin - who had right of way?

Step 2: Read the Verdict
You’ll get a structured JSON response rendered as a clean, readable report:
json{
  "rule": "Under-braking and punting (BMW SIM GT Rule 5)",
  "fault": { "Car A": "91%", "Car B": "9%" },
  "explanation": "Car A attempted a late lunge into the braking zone without sufficient overlap. 'Its the responsibility of the overtaking car to do so safely.' Contact was avoidable.\n\nTip A: Brake 10m earlier when no overlap.\nTip B: Hold racing line firmly.",
  "overtake_tip": "Establish overlap before the apex — never dive into the 'Vortex of Danger'.",
  "defend_tip": "Stay predictable. Don't weave — just hold your line.",
  "confidence": "High"
}

How to Use the Verdict (Best Practices)

























GoalHow to Use ItLearnRead the rule quote and explanation — understand why it happenedImproveApply the overtake_tip and defend_tip in your next raceTeachShare the verdict in your league Discord with: "Here’s what the stewards say — let’s all get better!"Settle DebatesUse the fault % and confidence to end arguments fairly
Never use it to shame. Always use it to teach.

For League Admins & Stewards
Use as a Template
Every verdict is a ready-to-post template:
Incident: Divebomb into T1
Rule: BMW SIM GT Rule 5 – Under-braking and punting
Fault: Car A: 91% | Car B: 9%
Verdict: Car A is predominantly at fault for a late, unsafe overtake.
Action: Warning issued.
Tips:
Overtakers: Brake earlier without overlap
Defenders: Hold your line — no need to yield
Confidence: High (3 dataset matches + rule match)

Copy, paste, done. No bias. No drama.

Use as a Learning Tool

Post weekly "Steward’s Corner" in your league
Create a "Verdict of the Week" highlight
Train new drivers with real examples

Example:
"Last week, 3 divebombs were reviewed. All 3 had <50% overlap. Lesson: Overlap = Right to Space."

Community Guidelines (Keep It Clean)

























DoDon’tShare verdicts to educateUse verdicts to shame or attackQuote the rule and tipsArgue with the % — it’s a guide, not a gavelSay "Let’s learn from this"Say "You’re 91% wrong!"Encourage spotter useIgnore the spotter advice

Onboarding New Users (Quick Start Guide)
For New Drivers

Watch this 2-min video:How to Use Sim Racing Stewards
Submit your first incident — even if it’s your mistake
Read the tips aloud in practice — make them muscle memory
Join the Discord → ask questions, share learnings

For League Organizers

Add a "Stewards" channel in Discord
Pin the template above
Require all protests to include a YouTube link
Review 1 verdict per week as a group


Pro Tips for Better Analysis

























TipWhy It HelpsUse unlisted YouTube linksKeeps videos private to your leagueAdd timestamps in titlee.g., T1 Incident @ 0:45 → faster matchingTag incident typeDivebomb, Unsafe Rejoin, Blocking → better AIReview your own clipsSelf-stewarding = fastest improvement

The Philosophy
"We don’t win by pointing fingers.
We win by getting better — together."
This tool exists to:

Reduce drama
Speed up reviews
Teach real rules
Build better racers


Technical Notes (For Devs)

CSV Dataset:public/simracingstewards_28k.csv → train with real verdicts
Fault Engine: 40% CSV + 40% BMW Rules + 20% Heuristics
Confidence: High = 3+ matches + rule hit
API:POST /api/analyze-intranet → { url: "https://youtube.com/..." }


Join the Movement

Submit an incident → thesimracingstewards.com
Share your verdict (with permission)
Tag @SimRacingStewards on X or Discord
Help us train the AI — submit your league’s past rulings


Final Word
Every great racer was once a student of their mistakes.
Let The Sim Racing Stewards be your coach.

Race hard. Race clean. Race fair.
See you on the grid.
— The Sim Racing Stewards Team
Built for the community, by the community.

Download this manual: PDF Version
Join Discord: discord.gg/simracingstewards
Submit Incident: thesimracingstewards.com

This tool is powered by data, rules, and respect. Use it wisely.
