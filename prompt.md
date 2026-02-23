ANTIGRAVITY AGENT PROMPT
Project: ARES COMMAND — Mars Colony Simulation Dashboard
Version handoff: v2 → v3 (Production Build)

CONTEXT — WHO YOU ARE WORKING FOR
You are building an educational simulation dashboard for a university English as a Foreign Language (EFL) classroom. The teacher (Sergi) runs a multi-week Mars colonisation storyline with 4th-year university students at CEFR B1.2–B2.1 level in a Spanish-speaking context. This is Lesson 7 of the unit.
The dashboard is used live in class, projected on screen, with students working in teams of 4. Each team selects equipment, submits proposals, receives diagnostic feedback, and presents their strategic reasoning individually in English. The simulation is the vehicle — the real goal is getting students to speak, negotiate, justify, and argue in English for 70%+ of class time.
This is not a toy. It runs in a real classroom with real students. Reliability, clarity and speed matter above everything.

WHAT ALREADY EXISTS — YOUR STARTING FILE
You have a single self-contained HTML file: mars-colony-bi-crimson-v2.html
Tech stack:

Pure HTML + CSS + vanilla JavaScript (no frameworks, no build tools)
Chart.js 4.4.0 via CDN (cdnjs.cloudflare.com)
Google Fonts: IBM Plex Mono, Nunito Sans, Montserrat
Zero server dependency — runs by opening the file in any browser
~1,200 lines, fully functional

Design system (DO NOT CHANGE):

Light grey background (#f0f0f0), white panels
Crimson primary (#8b1a1a) — headers, accents, borders
IBM Plex Mono for data/numbers, Montserrat for headers, Nunito Sans for body
BI / Power BI aesthetic — corporate, clean, data-forward
NO dark mode, NO neon, NO terminal aesthetic

What the file already does:

TAB 01 — SITE BRIEF: Two photo cards (Mars planet + Olympus Mons site) with real scientific parameters. Five Chart.js data visualisations using real NASA/ESA instrument data (RAD radiation, REMS temperature, MCS dust optical depth, solar irradiance comparison, atmospheric composition donut). Three data tables (wind regime, pressure-altitude profile, geological survey). Mission rules panel.
TAB 02 — EQUIPMENT: 20 selectable equipment cards. Each has MU cost (1–4), description, dependency/risk/bonus tags, and a checkmark selector. Max 4 selectable at once.
TAB 03 — PROPOSAL: Team ID input, budget selector (11/12/13 MU), 4 item slots, habitation strategy picker (surface / partial subsurface / fully subsurface), justification textareas, submit button. Round tracking (V1/V2/V3). Item locking after V1.
TAB 04 — SIM FEEDBACK: JavaScript simulation engine calculates power balance, applies item modifiers to 5 survival indices (RS/ES/EP/BC/CS), runs conditional rules, generates Mission Viability score, detects failure pathways, projects failure day.
TAB 05 — LANGUAGE SUPPORT: Negotiation frames by function (prioritising, hedging risk, challenging, conceding, building on idea, presenting findings). Technical vocabulary table.
TAB 06 — PRESENTATION: 4-step individual presentation guide, 5-criterion assessment rubric, preparation notes field.
TEACHER MODAL: PIN-locked (PIN: ARES). Teacher enters team IDs + budgets (11/12/13 MU). On broadcast, budget auto-populates when student enters matching Team ID.



Simulation logic summary:

5 indices: RS (Radiation Safety), ES (Energy Stability), EP (Environmental Protection), BC (Backup & Repair), CS (Crew Sustainability)
Each item has modifiers (RS/ES/EP/BC/CS deltas), power output (kW), power draw (kW)
Power deficit → ES penalty
Conditional rules: excavator+rover = subsurface bonus; solar without dust removal = Day 60 ES failure; surface habitat without shield = Day 27 RS failure; no water recycling = Day 90 CS failure; reactor without repair kit = BC penalty
MV formula: (RS×0.25)+(ES×0.20)+(EP×0.20)+(BC×0.15)+(CS×0.20). Pass = MV ≥ 3.0 AND all indices above threshold
Feedback is diagnostic only — tells what fails and when, never tells students what to do

WHAT YOU NEED TO BUILD — THE UPGRADE LIST
Work through these tasks in order. Complete each one fully before starting the next. After each task, open the file in a browser and verify it works before proceeding.

TASK 1 — TEACHER DASHBOARD: CLASS OVERVIEW PANEL
What to add inside the Teacher Modal (after the existing budget broadcast section):
Add a third section titled "CLASS OVERVIEW — LIVE SUBMISSIONS" with a table that shows every team's latest simulation result in one view.
The table columns should be:
TEAM ID | ROUND | MV SCORE | RS | ES | EP | BC | CS | STATUS | FAIL DAY

Each row = one team's most recent submission
MV score coloured: green if ≥3.0, red if <3.0
Each index score coloured: green if above threshold, orange if within 0.5 of threshold, red if below threshold
STATUS column: VIABLE / CRITICAL / NON-VIABLE badge
FAIL DAY column: shows projected day or "—" if no failure
Table updates live every time any team submits a proposal
If no submissions yet, show: "No submissions yet — waiting for teams"
Add a "CLEAR ALL DATA" button (with confirmation dialog) that resets all submissions across all teams

Implementation note: submissions are stored in the existing S.submissions array per browser session. For multi-team use in a single classroom session, you will need to store submissions by team ID in a new object: allTeamSubmissions = {} keyed by team ID, value = array of submission objects.


TASK 2 — SOL COUNTER: MAKE IT TICK
The header currently shows "SOL 001" as a static label.
Make it a live countdown timer:

On page load, start counting from SOL 001
Each real-world minute = 1 Sol (classroom-appropriate pace)
Display format: SOL 047 (zero-padded to 3 digits)
When SOL reaches 180, stop counting and display: SOL 180 — MISSION COMPLETE in green
Add a small reset button (🔄) next to the Sol counter, visible only in Teacher Modal when unlocked — clicking it resets Sol to 001
The Sol counter should pulse with a subtle red glow animation when between SOL 170–179 (danger zone warning)

TASK 3 — EQUIPMENT TAB: POWER BUDGET VISUALISER
Currently the equipment tab shows selected count and MU used as plain text.
Add a live power dashboard above the item grid with:
A horizontal bar showing:

Total power generation (kW) from selected items — green fill
Total power draw (kW) from selected items — red fill
Net margin (kW) — labelled clearly
Each displayed as a number AND a proportional bar segment

Additionally, add a Dependency Alert section that appears dynamically when:

Solar array (item 2) is selected without dust removal (item 3) → show warning: "Solar without dust management — output degrades by Day 60"
Item 14 (robotic manipulator) is selected without item 13 (repair toolkit) → "Manipulator has reduced effectiveness without toolkit"
Item 10 (hydroponics) is selected without item 8 (water recycling) → "Hydroponics requires stable water input — water recycling recommended"
Items 4+5 are both selected → show positive alert (green): "Excavator + Rover combination detected — subsurface access possible"

These alerts should appear/disappear in real time as items are selected/deselected. They are hints about dependencies, not solutions — phrased neutrally.


TASK 4 — FEEDBACK TAB: TRAJECTORY CHART
Currently feedback shows index scores as numbers and bars at Day 0.
Add a projected trajectory line chart below the index score table in each feedback report:

X-axis: Days 0 to 180 (in steps of 30)
Y-axis: Index score (0 to 5)
One line per index (RS, ES, EP, BC, CS) — colour coded
Show threshold lines as dashed horizontal lines for each index
Lines trend downward for degrading systems (solar dust, surface radiation, water depletion) at the rates implied by the simulation logic
Lines are flat if no degradation applies
Mark the projected failure day with a vertical red dashed line and label "DAY X — [INDEX] CRITICAL"
Chart should be compact (height: ~220px) and use the existing design system colours
Use Chart.js (already loaded)

The trajectory data should be computed from the same simulation results — derive the per-day decline rates from the conditional rules already in the engine.


TASK 5 — PROPOSAL TAB: COMPARISON VIEW
After a team has submitted V1, add a "COMPARE V1 vs V2" section that appears in the Proposal tab when round ≥ 2.
Show a side-by-side diff table:

Left column: V1 items (with MU cost)
Right column: V2 items (with MU cost)
Rows that changed should be highlighted with a light yellow background
Show the MV score change: "MV 2.14 → 2.87 (+0.73)" — coloured green if improved, red if worse
Show index-by-index changes: RS: 1.8 → 2.6 (+0.8) ✓ etc.

This is pedagogically important — students need to articulate what they changed and why when presenting. The comparison gives them the data to do that.

TASK 6 — GENERAL CODE QUALITY (DO LAST)
Only after all tasks 1–7 are working:

Remove all console.log statements if any exist
Add id attributes to any interactive elements that don't have them
Ensure keyboard navigation — all buttons and interactive elements reachable by Tab key
Test on mobile viewport (375px width) — the layout should degrade gracefully. At minimum, charts should still render and tabs should remain accessible via scroll
Validate that the Teacher PIN still works and that the class overview table in Task 1 integrates cleanly with the existing modal structure
Add a <meta name="description"> tag to the document head with value: "ARES COMMAND — Mars Colony Simulation — EFL University Lesson 7 Interactive Dashboard"


CONSTRAINTS — THINGS YOU MUST NOT DO

Do NOT change the visual design. Crimson + light grey BI theme is final. Do not add any dark mode, neon colours, or terminal aesthetics.
Do NOT add any external libraries beyond Chart.js (already loaded) and Google Fonts (already loaded). No React, no Vue, no jQuery, no Tailwind.
Do NOT add a backend or server. Everything must work by opening the HTML file locally in a browser.
Do NOT change the simulation engine logic (the simulate() function) unless a task explicitly requires it. The learning design depends on specific failure pathways being discoverable, not given.
Do NOT add tooltips or hover explanations that reveal what items do to which survival index. Students must infer this from the data.
Do NOT change the tab structure (6 tabs). Do not add new top-level tabs. New content goes inside existing tabs or inside the teacher modal.
Do NOT change the Teacher PIN (ARES). Leave it hardcoded.
Do NOT make the file dependent on internet connection for core functionality. Charts.js and fonts are CDN — that's acceptable. But the simulation, feedback, and all logic must work offline.


PEDAGOGICAL RULES — READ THESE CAREFULLY
These are non-negotiable for the educational integrity of the simulation:

Feedback is diagnostic, never prescriptive. The system tells students what is failing and when. It never tells them what to select, what to change, or what the correct answer is.
The subsurface discovery must remain emergent. Items 4 (Excavator) and 5 (Rover) unlock a powerful subsurface bonus, but this must not be hinted at directly. The Dependency Alert in Task 3 may show "Subsurface access possible" but must NOT say it improves radiation safety or environmental protection.
Budget differentiation is intentional. Teams with 11 MU face a harder constraint than teams with 12 or 13 MU. The simulation must treat these budgets differently. Do not equalise them.
The 3-round submission limit is a hard constraint. Students cannot submit more than 3 times. After V3, the submit button is permanently disabled.
Language support frames are scaffolding, not scripts. They use placeholders like [item], [index], [N] intentionally — students fill these in themselves.



OUTPUT EXPECTATION
When you are done, deliver:

A single updated mars-colony-final.html file
A brief summary of every change made, task by task
Any decisions you made where the brief was ambiguous
A list of anything you could not implement and why

Test the file in Chrome before delivering. Open browser DevTools console and confirm zero errors on load.


FINAL NOTE
This file will be used in a real classroom, projected live, with students who have been following this storyline for several weeks. The teacher has invested significant time designing this experience. Build it like it matters — because it does.