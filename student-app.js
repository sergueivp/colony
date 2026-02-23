import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  onDisconnect,
  onValue,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  serverTimestamp as fsServerTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

const cfg = window.FIREBASE_CONFIG || {};
const invalidConfig =
  !cfg.apiKey ||
  !cfg.authDomain ||
  !cfg.projectId ||
  !cfg.appId ||
  !cfg.databaseURL ||
  cfg.projectId === 'REPLACE_ME' ||
  cfg.databaseURL.includes('REPLACE_ME');
const app = initializeApp(cfg);
const db = getDatabase(app);
const fs = getFirestore(app);
const auth = getAuth(app);

const {
  ITEMS,
  IDX_NAMES,
  THRESH,
  FLOORS,
  IMODS,
  simulate,
  getTrajectories,
  getMissionStatus,
  getStatusClass
} = window.MarsSim;

const LANG_FRAMES = [
  { cat: 'PRIORITISING', frames: ['The way I see it, [item] has to come first because without it nothing else holds up.', 'If we lose [index], the entire configuration collapses - that is non-negotiable.', 'We can afford to be weak on [X] if and only if we compensate with [Y].'] },
  { cat: 'HEDGING RISK', frames: ['The risk here is manageable as long as we have [item] covering the gap.', 'This could turn critical by Day [N] if we do not account for the dust degradation.', 'I would be more confident about this if we had [item] as a backup.'] },
  { cat: 'CHALLENGING A CHOICE', frames: ['That assumes we have enough power to run it - do we actually have the budget for the draw?', 'What happens on Day 90 when the maintenance cycle kicks in and we have nothing to repair it with?', 'How is the solar array still generating enough if we have not dealt with dust accumulation?'] },
  { cat: 'CONCEDING A TRADE-OFF', frames: ['Fair point - that is a trade-off we would have to accept going in.', 'I get that [item] is expensive, but the alternative is a 30-day window before [index] fails.', 'We are essentially gambling that [risk] will not materialise. Is that a bet we are comfortable making?'] },
  { cat: 'BUILDING ON AN IDEA', frames: ['If we go with that, then we also need [item] - otherwise the dependency is not covered.', 'That only works if we pair it with [item], otherwise the power draw pushes us into deficit.', 'Right - and that actually opens up the option of [strategy], which changes the whole picture.'] },
  { cat: 'PRESENTING A FINDING', frames: ['The feedback data suggests that [index] is the critical failure driver, not [other index].', 'Based on the Day 62 projection, we are looking at a radiation exposure problem, not an energy problem.', 'The weakest link in our current configuration is [item/index], and here is why that matters...'] }
];

const VOCAB = [
  ['cascade failure', 'a situation where one system failing triggers other failures in sequence'],
  ['redundancy', 'having backup systems so a single failure does not end the mission'],
  ['trade-off', 'accepting a disadvantage in one area to gain an advantage in another'],
  ['mission viability', 'whether the colony can survive the full 180-day mission'],
  ['index threshold', 'the minimum score a system index must maintain to avoid failure'],
  ['power budget', 'the total electricity available and how it is distributed between systems'],
  ['reconfiguration cost', 'the extra MU penalty for changing a non-locked item after v1'],
  ['diagnostic feedback', 'information telling you what is failing and when, not what to do'],
  ['regolith', 'the loose surface material (rock, dust, soil) covering the Martian surface'],
  ['subsurface habitation', 'living below the surface, inside natural formations or buried structures']
];

const PRES_STEPS = [
  { num: 'STEP 01', title: 'Name and Function', time: '~15 sec', desc: 'State the item\'s name and explain in one clear sentence what problem it solves for the colony.' },
  { num: 'STEP 02', title: 'Index Impact', time: '~30 sec', desc: 'Identify which survival indices this item affects and explain how. Use specific terms: "This raises our Radiation Safety index by..." or "Without this, Energy Stability degrades..."' },
  { num: 'STEP 03', title: 'Strategic Justification', time: '~45 sec', desc: 'Why was this item essential to your team\'s overall strategy? What would the Day 180 outcome look like without it? Reference simulation feedback where available.' },
  { num: 'STEP 04', title: 'Trade-off Acknowledgement', time: '~30 sec', desc: 'What did selecting this item cost you? What capability did you sacrifice by allocating those MU here instead of an alternative?' }
];

const RUBRIC = [
  ['Strategic Reasoning', 'Logically coherent; trade-offs clearly understood', 'Mostly coherent; trade-offs acknowledged', 'Argument partially developed', 'No clear reasoning'],
  ['Target Discourse', 'Hedging, justification, concession used naturally', 'Correct but inconsistent use', 'Limited use of target frames', 'Language absent or incorrect'],
  ['Precision', 'References specific indices, days, dependencies', 'References some specific data', 'General claims only', 'Vague throughout'],
  ['Fluency', 'Confident, sustained, within 2-min window', 'Minor hesitations; generally fluent', 'Noticeable pauses; reads from notes', 'Cannot complete task'],
  ['Engagement', 'Connects item explicitly to whole-team strategy', 'Some connection to strategy', 'Item presented in isolation', 'No connection to strategy']
];

let S = { selected: [], budget: 12, round: 1, locked: [], habitation: null, submissions: [], reconfig: 0 };
let teamCtx = null;
let sessionState = null;
let teamState = null;
let teamStateLoaded = false;
let unsubs = [];
let solTick = null;
let lastTrajectoryCharts = [];
let authReady = false;
let authReadyPromise = Promise.resolve();
let presenceHeartbeat = null;
const PRESENCE_CLIENT_ID_KEY = 'ares_presence_client_id_v1';

const STORAGE_KEY = 'ares_student_team_context_v1';

function byId(id) {
  return document.getElementById(id);
}

function formatFirebaseError(err, fallback) {
  const code = err?.code ? ` (${err.code})` : '';
  const msg = err?.message ? ` ${err.message}` : '';
  return `${fallback}${code}${msg}`;
}

function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeLatestSnapshotWithRetry(pathRef, payload, attempts) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await set(pathRef, payload);
      return;
    } catch (err) {
      lastErr = err;
      await wait(250 * (i + 1));
    }
  }
  throw lastErr || new Error('Failed to write latest snapshot');
}

function parseJoinCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function showToast(msg, type) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function setLockState(message, isErr) {
  byId('lock-screen').style.display = 'flex';
  byId('app-content').style.display = 'none';
  const status = byId('lock-screen-status');
  status.textContent = message;
  status.style.color = isErr ? 'var(--red)' : 'var(--text-2)';
}

function setAppVisible() {
  byId('lock-screen').style.display = 'none';
  byId('app-content').style.display = 'block';
}

function getPresenceClientId() {
  let id = sessionStorage.getItem(PRESENCE_CLIENT_ID_KEY);
  if (id) return id;
  if (window.crypto?.randomUUID) {
    id = window.crypto.randomUUID();
  } else {
    id = `c-${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
  }
  sessionStorage.setItem(PRESENCE_CLIENT_ID_KEY, id);
  return id;
}

function getPresenceRefForCurrentTeam() {
  if (!teamCtx?.sessionId || !teamCtx?.teamId) return null;
  const clientId = getPresenceClientId();
  return ref(db, `sessions/${teamCtx.sessionId}/presence/${teamCtx.teamId}/${clientId}`);
}

async function stopPresenceTracking(removeNow) {
  if (presenceHeartbeat) {
    clearInterval(presenceHeartbeat);
    presenceHeartbeat = null;
  }
  if (!removeNow) return;
  const pRef = getPresenceRefForCurrentTeam();
  if (!pRef) return;
  try {
    await remove(pRef);
  } catch (_e) {
    // Ignore cleanup errors on voluntary leave.
  }
}

async function startPresenceTracking() {
  if (!authReady) return;
  const pRef = getPresenceRefForCurrentTeam();
  if (!pRef) return;

  await stopPresenceTracking(false);
  const payload = {
    online: true,
    teamId: teamCtx.teamId,
    sessionId: teamCtx.sessionId,
    lastSeen: Date.now()
  };

  try {
    await set(pRef, payload);
    onDisconnect(pRef).remove().catch(() => {});
    presenceHeartbeat = setInterval(() => {
      update(pRef, { online: true, lastSeen: Date.now() }).catch(() => {});
    }, 10000);
  } catch (err) {
    showToast(formatFirebaseError(err, 'Presence tracking failed'), 'err');
  }
}

function clearRealtimeListeners() {
  unsubs.forEach((unsub) => {
    if (typeof unsub === 'function') unsub();
  });
  unsubs = [];
}

function clearTrajectoryCharts() {
  lastTrajectoryCharts.forEach((ch) => ch.destroy());
  lastTrajectoryCharts = [];
}

function resetStateForJoin() {
  S = { selected: [], budget: 12, round: 1, locked: [], habitation: null, submissions: [], reconfig: 0 };
  byId('crit-risk').value = '';
  byId('strategy').value = '';
  byId('fb-empty').style.display = 'block';
  byId('fb-container').innerHTML = '';
  byId('fb-container').style.display = 'none';
  document.querySelectorAll('.hab-opt').forEach((e) => e.classList.remove('selected'));
  clearTrajectoryCharts();
  updateUI();
  renderRounds();
}

function updateIdentityUI() {
  byId('team-id').value = teamCtx?.teamId || '';
  byId('team-display').textContent = 'TEAM: ' + (teamCtx?.teamId || '-');
  byId('teacher-budget-note').style.display = teamCtx ? 'flex' : 'none';
  byId('teacher-budget-text').textContent = teamCtx ? `Budget assigned by teacher: ${S.budget} MU` : '';
  byId('leave-session-btn').style.display = teamCtx ? 'inline-block' : 'none';
}

function setBudget(mu) {
  S.budget = Number(mu || 12);
  byId('budget-sel').value = String(S.budget);
}

function getUsedMU() {
  return S.selected.reduce((sum, id) => {
    const item = ITEMS.find((it) => it.id === id);
    return sum + (item ? item.mu : 0);
  }, 0) + S.reconfig;
}

function renderEquipment() {
  byId('item-grid').innerHTML = ITEMS.map((item) => {
    const sel = S.selected.includes(item.id);
    const dis = !sel && S.selected.length >= 4;
    const tags = item.tags.map((t, i) => `<span class="tag tag-${item.tt[i]}">${t}</span>`).join('');
    return `<div tabindex="0" class="item-card ${sel ? 'selected' : ''} ${dis ? 'disabled' : ''}" onclick="toggleItem(${item.id})" onkeypress="if(event.key==='Enter'||event.key===' ') toggleItem(${item.id})" id="ic-${item.id}">
      <div class="sel-dot">✓</div>
      <div class="item-hdr">
        <div><div class="item-num">ITEM ${String(item.id).padStart(2, '0')} · ${item.affects}</div><div class="item-name">${item.name}</div></div>
        <div class="item-mu">${item.mu}<span>MU</span></div>
      </div>
      <div class="item-body"><div class="item-desc">${item.desc}</div><div class="item-tags">${tags}</div></div>
    </div>`;
  }).join('');
}

function renderSlots() {
  byId('slot-list').innerHTML = [1, 2, 3, 4].map((n) => {
    const id = S.selected[n - 1];
    const item = id ? ITEMS.find((i) => i.id === id) : null;
    const locked = id && S.locked.includes(id);
    return `<div class="slot-row ${item ? 'filled' : ''} ${locked ? 'locked' : ''}">
      <div class="slot-num">0${n}</div>
      <div>${item ? `<div class="slot-name">${item.name}</div>${locked ? '<div class="lock-badge">LOCKED</div>' : ''}` : '<div class="slot-empty">Empty - select from Equipment</div>'}</div>
      <div class="slot-cost">${item ? item.mu + ' MU' : '-'}</div>
    </div>`;
  }).join('');
}

function renderBudget() {
  const used = getUsedMU();
  const pct = Math.min((used / S.budget) * 100, 100);
  const over = used > S.budget;

  byId('mu-used').textContent = used;
  byId('mu-total').textContent = S.budget;
  byId('mu-used-eq').textContent = used;

  const bar = byId('bud-bar');
  bar.style.width = pct + '%';
  bar.className = 'bud-bar' + (over ? ' over' : '');

  const bw = byId('bud-warn');
  if (over) {
    bw.style.display = 'flex';
    byId('bud-warn-text').textContent = `Budget exceeded by ${used - S.budget} MU.`;
  } else {
    bw.style.display = 'none';
  }

  const btn = byId('submit-btn');
  const note = byId('submit-note');
  const ready = S.selected.length === 4 && !over && S.habitation && teamCtx && sessionState?.status === 'RUNNING' && (teamState?.submissionCount || 0) < 3;
  btn.disabled = !ready;

  if (!teamCtx) note.textContent = 'Join session first';
  else if (sessionState?.status !== 'RUNNING') note.textContent = 'Simulation not running';
  else if ((teamState?.submissionCount || 0) >= 3) note.textContent = 'Maximum 3 rounds reached';
  else if (S.selected.length < 4) note.textContent = `Select ${4 - S.selected.length} more item(s)`;
  else if (!S.habitation) note.textContent = 'Select habitation strategy';
  else if (over) note.textContent = 'Budget exceeded';
  else note.textContent = 'Ready to submit';
}

function renderRounds() {
  const rw = byId('round-wrap');
  rw.innerHTML = ['V1', 'V2', 'V3'].map((r, i) => {
    const n = i + 1;
    const c = n < S.round ? 'done' : n === S.round ? 'active' : '';
    return `${i > 0 ? '<div class="rd-line"></div>' : ''}<div class="rd-dot ${c}">${r}</div>`;
  }).join('');

  const badges = ['V1 - INITIAL', 'V2 - REVISION', 'V3 - FINAL'];
  byId('round-badge').textContent = badges[S.round - 1] || 'COMPLETE';
  byId('round-display').textContent = 'ROUND: V' + S.round;
  byId('lock-warn').style.display = S.round > 1 ? 'flex' : 'none';
}

function renderLanguage() {
  byId('lang-frames').innerHTML = LANG_FRAMES.map((c) => `
    <div class="frame-cat"><div class="frame-cat-title">${c.cat}</div>
    ${c.frames.map((f) => `<div class="frame-item">"${f}"</div>`).join('')}</div>`).join('');

  byId('vocab-table').innerHTML =
    `<thead><tr><th>TERM</th><th>MEANING</th></tr></thead><tbody>` +
    VOCAB.map((v) => `<tr><td style="color:var(--crimson);font-family:var(--font-mono);font-size:10px">${v[0]}</td><td>${v[1]}</td></tr>`).join('') +
    `</tbody>`;
}

function renderPresentation() {
  byId('pres-steps').innerHTML = PRES_STEPS.map((s) => `
    <div class="pres-step"><div class="pres-step-num">${s.num}</div><div class="pres-step-title">${s.title}</div>
    <div class="pres-step-time">${s.time}</div><div class="pres-step-desc">${s.desc}</div></div>`).join('');

  byId('rubric-table').innerHTML =
    `<thead><tr><th>CRITERION</th><th>4</th><th>3</th><th>2</th><th>1</th></tr></thead><tbody>` +
    RUBRIC.map((r) => `<tr>${r.map((c, i) => `<td ${i === 0 ? 'style="color:var(--crimson);font-family:var(--font-mono);font-size:10px;font-weight:600"' : ''}>${c}</td>`).join('')}</tr>`).join('') +
    `</tbody>`;
}

function updatePowerDashboard() {
  let pOut = 0;
  let pDraw = 0;
  S.selected.forEach((id) => {
    pOut += IMODS[id].pOut;
    pDraw += IMODS[id].pDraw;
  });

  const net = pOut - pDraw;
  byId('eq-gen').textContent = pOut;
  byId('eq-draw').textContent = pDraw;
  byId('eq-net').textContent = (net > 0 ? '+' : '') + net;
  byId('eq-net').style.color = net < 0 ? 'var(--red)' : net > 0 ? 'var(--green)' : 'var(--text)';

  const maxScale = Math.max(15, pOut + pDraw);
  byId('eq-bar-gen').style.width = (pOut / maxScale * 100) + '%';
  byId('eq-bar-draw').style.width = (pDraw / maxScale * 100) + '%';

  const alerts = [];
  const has = (id) => S.selected.includes(id);
  if (has(2) && !has(3)) alerts.push({ c: 'var(--orange)', t: 'Solar without dust management - output degrades by Day 60', good: false });
  if (has(14) && !has(13)) alerts.push({ c: 'var(--orange)', t: 'Manipulator has reduced effectiveness without toolkit', good: false });
  if (has(10) && !has(8)) alerts.push({ c: 'var(--orange)', t: 'Hydroponics requires stable water input - water recycling recommended', good: false });
  if (has(4) && has(5)) alerts.push({ c: 'var(--green)', t: 'Excavator + Rover combination detected - subsurface access possible', good: true });

  const el = byId('eq-alerts');
  if (alerts.length === 0) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = alerts.map((a) => {
    const boxBg = a.good ? 'rgba(26,122,74,0.07)' : 'rgba(192,57,43,0.07)';
    const boxBorder = a.good ? 'rgba(26,122,74,0.3)' : 'rgba(192,57,43,0.3)';
    const ic = a.good ? '✓' : '⚠';
    return `<div class="warn-box" style="margin-bottom:0;background:${boxBg};border-color:${boxBorder}"><span class="warn-icon" style="color:${a.c}">${ic}</span><span class="warn-text" style="color:${a.c}">${a.t}</span></div>`;
  }).join('');
}

function renderComparison() {
  const panel = byId('comparison-panel');
  if (S.round === 1 || S.submissions.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  byId('compare-title').textContent = `COMPARE V${S.round - 1} vs V${S.round}`;

  const prevSub = S.submissions[S.submissions.length - 1];
  const prevIds = prevSub.selected;
  const currIds = S.selected;

  const pList = [...prevIds];
  const cList = [...currIds];
  while (pList.length < 4) pList.push(null);
  while (cList.length < 4) cList.push(null);

  let html = `<table class="raw-table" style="width:100%;margin-bottom:12px"><thead><tr><th style="width:50%">V${S.round - 1} ITEM</th><th style="width:50%">V${S.round} ITEM (CURRENT)</th></tr></thead><tbody>`;

  for (let i = 0; i < 4; i += 1) {
    const pid = pList[i];
    const cid = cList[i];
    const pItem = pid ? ITEMS.find((x) => x.id === pid) : null;
    const cItem = cid ? ITEMS.find((x) => x.id === cid) : null;
    const changed = pid !== cid;
    html += `<tr style="${changed ? 'background:#fff5cc' : ''}"><td class="val">${pItem ? `${pItem.name} (${pItem.mu} MU)` : '-'}</td><td class="val">${cItem ? `${cItem.name} (${cItem.mu} MU)` : '-'}</td></tr>`;
  }
  html += '</tbody></table>';

  if (currIds.length === 4 && S.habitation) {
    const current = simulate(currIds);
    const prev = prevSub.result;
    const mvDelta = current.mv - prev.mv;
    const mvColor = mvDelta > 0 ? 'var(--green)' : mvDelta < 0 ? 'var(--red)' : 'var(--text-3)';
    const deltaLabel = mvDelta > 0 ? `+${mvDelta.toFixed(2)}` : mvDelta.toFixed(2);

    html += `<div style="font-family:var(--font-mono);font-size:11px">MV SCORE: ${prev.mv.toFixed(2)} -> ${current.mv.toFixed(2)} (<span style="color:${mvColor};font-weight:700">${deltaLabel}</span>)</div>`;
    html += '<div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap;font-family:var(--font-mono);font-size:10px">';

    Object.keys(THRESH).forEach((k) => {
      const diff = current.sc[k] - prev.sc[k];
      const col = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text-3)';
      const d = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
      html += `<span>${k}: ${prev.sc[k].toFixed(2)} -> ${current.sc[k].toFixed(2)} (<span style="color:${col}">${d}</span>)</span>`;
    });

    html += '</div>';
  } else {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);font-style:italic">Select 4 items and habitation strategy to see index comparison.</div>';
  }

  byId('comparison-content').innerHTML = html;
}

function buildFeedback(result, round, team, habitation, chartId) {
  const status = getMissionStatus(result);
  const statusCls = getStatusClass(status);

  const idxRows = Object.keys(THRESH).map((k) => {
    const score = result.sc[k];
    const threshold = THRESH[k];
    const pct = Math.min((score / 5) * 100, 100);
    const cls = score >= threshold ? 'ok' : score >= FLOORS[k] ? 'warn' : 'fail';
    const col = cls === 'ok' ? 'var(--green)' : cls === 'warn' ? 'var(--orange)' : 'var(--red)';
    const label = cls === 'ok' ? 'NOMINAL' : cls === 'warn' ? 'CRITICAL' : 'FAILURE';

    return `<div class="idx-row">
      <div class="idx-name">${IDX_NAMES[k]}</div>
      <div class="idx-score ${cls}">${score.toFixed(2)}</div>
      <div class="idx-thresh">≥${threshold}</div>
      <div class="idx-bar-wrap"><div class="idx-bar" style="width:${pct}%;background:${col}"></div></div>
      <div class="idx-lbl" style="color:${col}">${label}</div>
    </div>`;
  }).join('');

  const lines = [];
  if (result.deficit > 0) lines.push({ c: 'crit', t: `Power demand exceeds generation by ${result.deficit} kW. Energy Stability penalty applied at Day 0.` });
  if (result.hasSub) lines.push({ c: '', t: 'Items 04 and 05 detected together. Subsurface mapping and excavation capacity confirmed.' });
  if (result.hasSolar && !result.hasDust) lines.push({ c: 'crit', t: 'Solar Array selected without dust management provision. Threshold breach projected around Day 60.' });
  if (result.hasHab && !result.hasShield && !result.hasSub) lines.push({ c: 'crit', t: 'Surface habitat without shielding detected. Radiation failure pathway projected around Day 27.' });
  if (!result.hasWater) lines.push({ c: 'crit', t: 'No water recycling system in configuration. Crew Sustainability failure pathway projected around Day 90.' });
  if (result.hasReactor && !result.hasRepair) lines.push({ c: '', t: 'Kilopower Reactor selected without maintenance provision. Backup & Repair degradation starts from Day 90.' });

  const failBlock = result.failDay !== null
    ? `<div class="fail-day"><div><div class="fail-day-lbl">PROJECTED CRITICAL EVENT — ${IDX_NAMES[result.failIdx]}</div><div style="font-family:var(--font-mono);font-size:9px;color:rgba(192,57,43,.6);margin-top:3px">${result.failReason || 'Index below catastrophic floor'}</div></div><div class="fail-day-val">DAY ${result.failDay}</div></div>`
    : '';

  return `<div class="fb-report">
    <div class="fb-hdr">
      <div><div class="fb-title">ARES COMMAND — SIMULATION REPORT ${['V1', 'V2', 'V3'][round - 1]}</div>
      <div class="fb-meta">TEAM: ${team || '-'} | SUBMISSION: ${['V1', 'V2', 'V3'][round - 1]} | HABITATION: ${(habitation || '-').toUpperCase()} | MV: ${result.mv.toFixed(2)}</div></div>
      <div class="fb-status ${statusCls}">${status}</div>
    </div>
    <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-3);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px">POWER BALANCE</div>
    <div class="g3 gap12 mb12" style="grid-template-columns:repeat(3,1fr)">
      <div class="pwr-box"><div class="pwr-lbl">GENERATION</div><div class="pwr-val" style="color:var(--green)">${result.pOut} kW</div></div>
      <div class="pwr-box"><div class="pwr-lbl">DEMAND</div><div class="pwr-val" style="color:${result.pDraw <= result.pOut ? 'var(--orange)' : 'var(--red)'}">${result.pDraw} kW</div></div>
      <div class="pwr-box"><div class="pwr-lbl">MARGIN</div><div class="pwr-val" style="color:${result.deficit === 0 ? 'var(--green)' : 'var(--red)'}">${result.deficit === 0 ? '+' + (result.pOut - result.pDraw) : '-' + result.deficit} kW</div></div>
    </div>
    <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-3);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px">INDEX SCORES AT DAY 0</div>
    ${idxRows}
    <div class="divider"></div>
    <div style="margin-top:16px;margin-bottom:16px">
      <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-3);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px">PROJECTED INDEX TRAJECTORIES (DAY 0–180)</div>
      <div style="position:relative;height:220px"><canvas id="${chartId}"></canvas></div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 160px;gap:16px;align-items:center">
      <div><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-3);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:12px">DIAGNOSTIC OBSERVATIONS</div>
      ${lines.map((l) => `<div class="fb-line ${l.c}">${l.t}</div>`).join('')}</div>
      <div class="mv-box"><div class="mv-lbl">MISSION VIABILITY</div><div class="mv-val ${result.mv >= 3.0 ? 'text-green' : 'text-red'}">${result.mv.toFixed(2)}</div><div class="mv-thresh">THRESHOLD: 3.00</div></div>
    </div>
    ${failBlock}
  </div>`;
}

function initTrajectoryChart(canvasId, result) {
  const traj = getTrajectories(result);
  const colors = { RS: '#8b1a1a', ES: '#c07000', EP: '#1a7a4a', BC: '#1a4a8b', CS: '#c0392b' };

  const vline = {
    id: 'failureLine',
    afterDraw(chart) {
      if (result.failDay === null) return;
      const x = chart.scales.x.getPixelForValue(result.failDay);
      const y = chart.scales.y;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(192,57,43,0.95)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y.top);
      ctx.lineTo(x, y.bottom);
      ctx.stroke();
      ctx.fillStyle = 'rgba(192,57,43,1)';
      ctx.font = 'bold 9px "IBM Plex Mono"';
      ctx.textAlign = result.failDay > 140 ? 'right' : 'left';
      ctx.fillText(` DAY ${result.failDay} — ${result.failIdx} CRITICAL`, result.failDay > 140 ? x - 2 : x + 2, y.top + 10);
      ctx.restore();
    }
  };

  const datasets = Object.keys(traj.data).map((k) => ({
    label: k,
    data: traj.data[k].map((v, i) => ({ x: traj.labels[i], y: v })),
    borderColor: colors[k],
    borderWidth: 2,
    fill: false,
    pointRadius: 3,
    tension: 0
  }));

  Object.keys(THRESH).forEach((k) => {
    datasets.push({
      label: `${k} Threshold`,
      data: [{ x: 0, y: THRESH[k] }, { x: 180, y: THRESH[k] }],
      borderColor: colors[k],
      borderWidth: 1,
      borderDash: [2, 4],
      pointRadius: 0,
      fill: false
    });
  });

  const chart = new Chart(byId(canvasId), {
    type: 'line',
    data: { datasets },
    plugins: [vline],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (ti) => ti.datasetIndex < 5,
          bodyFont: { family: 'IBM Plex Mono', size: 10 }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 180,
          ticks: { stepSize: 30, font: { family: 'IBM Plex Mono', size: 8 }, color: '#9999aa' }
        },
        y: {
          min: 0,
          max: 5,
          ticks: { font: { family: 'IBM Plex Mono', size: 8 }, color: '#9999aa' }
        }
      }
    }
  });

  lastTrajectoryCharts.push(chart);
}

async function submitProposalSynced() {
  if (!teamCtx) {
    showToast('Join session first', 'err');
    return;
  }

  if (sessionState?.status !== 'RUNNING') {
    showToast('Simulation is not running', 'err');
    return;
  }

  const used = getUsedMU();
  if (S.selected.length !== 4 || used > S.budget || !S.habitation) {
    showToast('Complete 4 items, valid budget, and habitation first', 'err');
    return;
  }

  const submitRound = S.round;
  const result = simulate(S.selected);
  const payload = {
    round: submitRound,
    selected: [...S.selected],
    habitation: S.habitation,
    result,
    teamId: teamCtx.teamId,
    sessionId: teamCtx.sessionId
  };

  try {
    const teamRef = ref(db, `sessions/${teamCtx.sessionId}/teams/${teamCtx.teamId}`);
    const tx = await runTransaction(teamRef, (team) => {
      if (!team || !team.active) return team;
      const count = Number(team.submissionCount || 0);
      const currentRound = Number(team.currentRound || 1);
      if (count >= 3) return;
      const updated = { ...team };
      updated.submissionCount = count + 1;
      updated.currentRound = currentRound < 3 ? currentRound + 1 : 3;
      updated.lastSubmissionAt = Date.now();
      if (count === 0 && (!updated.lockedItems || updated.lockedItems.length === 0)) {
        updated.lockedItems = [...S.selected.slice(0, 2)];
      }
      return updated;
    });

    if (!tx.committed) {
      showToast('Submission rejected: round limit reached', 'err');
      return;
    }

    const missionStatus = getMissionStatus(result);
    await writeLatestSnapshotWithRetry(ref(db, `sessions/${teamCtx.sessionId}/latest/${teamCtx.teamId}`), {
      round: submitRound,
      mv: Number(result.mv || 0),
      scores: result.sc,
      status: missionStatus,
      failDay: result.failDay ?? null,
      failIdx: result.failIdx ?? null,
      teamId: teamCtx.teamId,
      updatedAt: Date.now()
    }, 3);

    const historyWritePromise = addDoc(
      collection(fs, `sessionSubmissions/${teamCtx.sessionId}/teams/${teamCtx.teamId}/submissions`),
      {
        ...payload,
        submittedAt: fsServerTimestamp(),
        clientVersion: 'student-web-v1'
      }
    );

    const chartId = `traj-chart-${Date.now()}`;
    const html = buildFeedback(result, submitRound, teamCtx.teamId, S.habitation, chartId);
    byId('fb-empty').style.display = 'none';
    byId('fb-container').style.display = 'block';
    byId('fb-container').innerHTML = html + byId('fb-container').innerHTML;

    S.submissions.push({ round: submitRound, selected: [...S.selected], result, hab: S.habitation });
    if (submitRound === 1) S.locked = S.selected.slice(0, 2);

    if (submitRound < 3) {
      S.round = submitRound + 1;
    } else {
      byId('submit-btn').disabled = true;
      byId('submit-note').textContent = 'Maximum 3 rounds reached';
    }

    renderRounds();
    renderSlots();
    renderComparison();
    showSec('feedback');
    showToast(`PROPOSAL V${submitRound} SUBMITTED`);
    initTrajectoryChart(chartId, result);

    try {
      await historyWritePromise;
    } catch (historyErr) {
      showToast(formatFirebaseError(historyErr, 'Live submit synced, but history write failed.'), 'err');
    }
  } catch (err) {
    showToast(formatFirebaseError(err, 'Network or sync error while submitting. Please retry.'), 'err');
  }
}

function syncSolDisplayFromSessionState() {
  const el = byId('sol-counter');
  if (!sessionState) {
    el.textContent = 'SOL 001';
    el.style.animation = 'none';
    return;
  }

  let currentSol = 1;
  if (sessionState.status === 'RUNNING') {
    const startAt = Number(sessionState.solStartAt || Date.now());
    const base = Number(sessionState.solBase || 1);
    const elapsed = Math.max(0, Math.floor((Date.now() - startAt) / 60000));
    currentSol = Math.min(180, base + elapsed);
  }

  if (currentSol >= 180) {
    el.innerHTML = 'SOL 180 — MISSION COMPLETE';
    el.style.color = 'var(--green)';
    el.style.animation = 'none';
    return;
  }

  el.textContent = `SOL ${String(currentSol).padStart(3, '0')}`;
  el.style.color = '#fff';
  if (currentSol >= 170 && currentSol < 180) {
    el.style.animation = 'pulse-red 1.5s infinite';
  } else {
    el.style.animation = 'none';
  }
}

function updateUI() {
  renderEquipment();
  renderSlots();
  renderBudget();
  byId('sel-count').textContent = S.selected.length;
  updatePowerDashboard();
  renderComparison();
}

function showSec(name) {
  document.querySelectorAll('.sec').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  byId('sec-' + name).classList.add('active');
  const tabs = ['site', 'equipment', 'proposal', 'feedback', 'language', 'presentation'];
  document.querySelectorAll('.nav-tab')[tabs.indexOf(name)]?.classList.add('active');
  window.scrollTo(0, 0);
}

function toggleItem(id) {
  if (S.locked.includes(id)) {
    showToast('ITEM LOCKED', 'err');
    return;
  }
  if (S.selected.includes(id)) {
    S.selected = S.selected.filter((x) => x !== id);
  } else {
    if (S.selected.length >= 4) {
      showToast('MAX 4 ITEMS - deselect one first', 'err');
      return;
    }
    S.selected.push(id);
  }
  updateUI();
}

function clearSel() {
  S.selected = S.selected.filter((id) => S.locked.includes(id));
  updateUI();
  showToast('Selection cleared');
}

function selHab(type, el) {
  S.habitation = type;
  document.querySelectorAll('.hab-opt').forEach((e) => e.classList.remove('selected'));
  el.classList.add('selected');
  renderBudget();
}

async function hydrateTeamStateFromFirestore() {
  if (!teamCtx) return;
  try {
    const docs = await getDocs(collection(fs, `sessionSubmissions/${teamCtx.sessionId}/teams/${teamCtx.teamId}/submissions`));
    const list = docs.docs.map((d) => d.data());
    list.sort((a, b) => {
      const ar = Number(a.round || 0);
      const br = Number(b.round || 0);
      return ar - br;
    });
    S.submissions = list.map((s) => ({
      round: s.round,
      selected: s.selected,
      result: s.result,
      hab: s.habitation
    }));
  } catch (_e) {
    S.submissions = [];
  }
}

function applyTeamNode(team) {
  teamStateLoaded = true;
  teamState = team || null;
  if (!teamState) {
    stopPresenceTracking(true);
    setLockState('Team was removed by teacher. Please contact your teacher for a new code.', true);
    byId('leave-session-btn').style.display = 'inline-block';
    return;
  }

  if (!teamState.active) {
    stopPresenceTracking(true);
    setLockState('Team access is not active. Wait for teacher instructions.', true);
    return;
  }

  setBudget(teamState.budgetMu || 12);
  S.round = Number(teamState.currentRound || 1);
  S.locked = Array.isArray(teamState.lockedItems) ? teamState.lockedItems : [];

  updateIdentityUI();
  updateUI();
  renderRounds();

  // Session status can arrive before team status; re-evaluate lock/app visibility now.
  if (sessionState) {
    applySessionNode(sessionState);
  } else {
    setLockState('Session joined. Waiting for teacher to start the simulation.', false);
  }
}

function applySessionNode(session) {
  sessionState = session || null;
  syncSolDisplayFromSessionState();

  if (!teamCtx) {
    setLockState('Enter your join code to access the simulation.', false);
    return;
  }

  if (!teamStateLoaded) {
    setLockState('Connecting team configuration...', false);
    return;
  }

  if (!teamState || !teamState.active) {
    setLockState('Team access is not active. Please contact your teacher.', true);
    return;
  }

  if (!sessionState) {
    setLockState('Session not found. Ask your teacher to start or reset the session.', true);
    return;
  }

  if (sessionState.status === 'RUNNING') {
    setAppVisible();
    return;
  }

  if (sessionState.status === 'FINISHED') {
    setLockState('Mission finished by teacher. Submissions are now locked.', true);
    return;
  }

  setLockState('Session joined. Waiting for teacher to start the simulation.', false);
}

async function attachRealtimeListeners() {
  clearRealtimeListeners();
  teamStateLoaded = false;
  const sessionRef = ref(db, `sessions/${teamCtx.sessionId}`);
  const teamRef = ref(db, `sessions/${teamCtx.sessionId}/teams/${teamCtx.teamId}`);

  unsubs.push(onValue(
    sessionRef,
    (snap) => applySessionNode(snap.val()),
    (error) => setLockState(formatFirebaseError(error, 'Session listener failed.'), true)
  ));
  unsubs.push(onValue(
    teamRef,
    (snap) => applyTeamNode(snap.val()),
    (error) => setLockState(formatFirebaseError(error, 'Team listener failed.'), true)
  ));

  await hydrateTeamStateFromFirestore();
  renderComparison();
  await startPresenceTracking();
}

async function studentJoinTeam(code) {
  if (invalidConfig) {
    setLockState('Firebase config is incomplete. Fill firebase.config.js first.', true);
    return;
  }

  const joinCode = parseJoinCode(code);
  if (!joinCode) {
    setLockState('Enter a valid join code.', true);
    return;
  }

  setLockState('Checking join code...', false);

  try {
    await stopPresenceTracking(true);
    await authReadyPromise.catch(() => null);

    if (!authReady) {
      setLockState('Authentication is not ready. Enable Anonymous sign-in and refresh.', true);
      return;
    }

    const joinSnap = await withTimeout(
      get(ref(db, `joinCodes/${joinCode}`)),
      12000,
      'Timed out while checking join code.'
    );
    if (!joinSnap.exists()) {
      setLockState('Join code not found. Check with your teacher.', true);
      return;
    }

    const joinData = joinSnap.val();
    if (joinData && joinData.active === false) {
      setLockState('Join code is inactive. Ask your teacher for a new code.', true);
      return;
    }
    if (!joinData?.sessionId || !joinData?.teamId) {
      setLockState('Join code record is invalid. Ask your teacher to re-save the team code.', true);
      return;
    }

    teamCtx = {
      joinCode,
      sessionId: joinData.sessionId,
      teamId: joinData.teamId
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(teamCtx));
    resetStateForJoin();
    updateIdentityUI();
    await attachRealtimeListeners();
    showToast('Team session connected');
  } catch (err) {
    const hint = err?.message === 'Timed out while checking join code.'
      ? 'Failed to join session. Check databaseURL and Realtime Database connectivity.'
      : 'Failed to join session.';
    setLockState(formatFirebaseError(err, hint), true);
  }
}

function leaveSession() {
  clearRealtimeListeners();
  if (solTick) {
    clearInterval(solTick);
    solTick = null;
  }
  teamCtx = null;
  teamState = null;
  sessionState = null;
  sessionStorage.removeItem(STORAGE_KEY);
  resetStateForJoin();
  updateIdentityUI();
  byId('join-code-input').value = '';
  setLockState('Enter your team code. Your budget and team assignment will load automatically.', false);
  stopPresenceTracking(true);
}

function installStaticCharts() {
  const SOLS = Array.from({ length: 180 }, (_, i) => i + 1);
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        bodyFont: { family: 'IBM Plex Mono', size: 10 },
        titleFont: { family: 'Montserrat', size: 10, weight: 'bold' }
      }
    },
    scales: {
      x: {
        ticks: { font: { family: 'IBM Plex Mono', size: 8 }, color: '#9999aa', maxTicksLimit: 12 },
        grid: { color: 'rgba(0,0,0,0.04)' },
        title: { display: true, text: 'SOL', font: { family: 'Montserrat', size: 9, weight: '700' }, color: '#9999aa' }
      },
      y: {
        ticks: { font: { family: 'IBM Plex Mono', size: 8 }, color: '#9999aa' },
        grid: { color: 'rgba(0,0,0,0.05)' }
      }
    }
  };

  const genRadData = () => {
    const d = [];
    for (let i = 0; i < 180; i += 1) {
      let v = 1.0 + (Math.sin(i * 0.3) * 0.08) + ((i % 7 === 0) ? 0.06 : 0) - ((i % 13 === 0) ? 0.04 : 0);
      if (i >= 28 && i <= 32) v = 14.2 - Math.abs(i - 30) * 2.8;
      else if (i >= 83 && i <= 87) v = 8.7 - Math.abs(i - 85) * 1.9;
      else if (i >= 140 && i <= 145) v = 11.3 - Math.abs(i - 142) * 2.1;
      d.push(Math.max(0.7, Math.round(v * 100) / 100));
    }
    return d;
  };

  const genTempMax = () => Array.from({ length: 180 }, (_, i) => Math.round(-45 + 18 * Math.sin((i - 45) * Math.PI / 100) + (i % 3 === 0 ? 2 : -1)));
  const genTempMin = () => Array.from({ length: 180 }, (_, i) => Math.round(-93 + 9 * Math.sin((i - 60) * Math.PI / 120) + (i % 4 === 0 ? 1 : -2)));
  const genDust = () => Array.from({ length: 180 }, (_, i) => {
    let v = 0.35;
    if (i > 30 && i < 55) v = 0.35 + (i - 30) * 0.018;
    else if (i >= 55 && i <= 75) v = 0.73 + (i - 55) * 0.1035;
    else if (i > 75 && i <= 95) v = 2.8 - (i - 75) * 0.12;
    else if (i > 95 && i <= 130) v = 0.42 + (i - 95) * 0.004;
    else if (i > 130) v = 0.56 + (i - 130) * 0.014;
    return Math.round(Math.min(3.0, Math.max(0.25, v)) * 100) / 100;
  });

  new Chart(byId('ch-rad'), {
    type: 'line',
    data: { labels: SOLS, datasets: [{ data: genRadData(), borderColor: '#8b1a1a', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(139,26,26,0.06)', pointRadius: 0, tension: 0.3 }] },
    options: { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, title: { display: true, text: 'mSv/day', font: { family: 'Montserrat', size: 9, weight: '700' }, color: '#9999aa' } } } }
  });

  const tMax = genTempMax();
  const tMin = genTempMin();
  new Chart(byId('ch-temp'), {
    type: 'line',
    data: { labels: SOLS, datasets: [{ label: 'Max °C', data: tMax, borderColor: '#c0392b', borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0.4 }, { label: 'Min °C', data: tMin, borderColor: '#1a4a8b', borderWidth: 1.5, fill: '+1', backgroundColor: 'rgba(26,74,139,0.07)', pointRadius: 0, tension: 0.4 }] },
    options: { ...chartOpts, plugins: { legend: { display: true, position: 'top', labels: { font: { family: 'IBM Plex Mono', size: 9 }, color: '#5a5a72', boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } }, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, title: { display: true, text: '°C', font: { family: 'Montserrat', size: 9, weight: '700' }, color: '#9999aa' } } } }
  });

  const dustData = genDust();
  new Chart(byId('ch-dust'), {
    type: 'line',
    data: { labels: SOLS, datasets: [{ data: dustData, borderColor: '#c07000', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(192,112,0,0.08)', pointRadius: 0, tension: 0.4 }, { data: SOLS.map(() => 1.0), borderColor: 'rgba(192,57,43,0.3)', borderWidth: 1, borderDash: [4, 3], fill: false, pointRadius: 0, label: 'tau=1.0 threshold' }] },
    options: { ...chartOpts, plugins: { legend: { display: false } }, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, title: { display: true, text: 'Optical Depth tau', font: { family: 'Montserrat', size: 9, weight: '700' }, color: '#9999aa' } } } }
  });

  new Chart(byId('ch-solar'), {
    type: 'bar',
    data: { labels: ['Earth avg', 'Mars avg', 'Mars peri.', 'Mars aph.', 'Site clear', 'Site tau=2.8'], datasets: [{ data: [1361, 589, 717, 493, 575, 35], backgroundColor: ['#dde0e6', '#8b1a1a', '#c0392b', '#1a4a8b', '#1a7a4a', '#9999aa'], borderRadius: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: false }, tooltip: { bodyFont: { family: 'IBM Plex Mono', size: 10 } } }, scales: { x: { ticks: { font: { family: 'IBM Plex Mono', size: 7 }, color: '#9999aa', maxRotation: 30 }, grid: { display: false } }, y: { ticks: { font: { family: 'IBM Plex Mono', size: 8 }, color: '#9999aa' }, grid: { color: 'rgba(0,0,0,0.05)' }, title: { display: true, text: 'W/m2', font: { family: 'Montserrat', size: 8, weight: '700' }, color: '#9999aa' } } } }
  });

  new Chart(byId('ch-atmos'), {
    type: 'doughnut',
    data: { labels: ['CO2 95.32%', 'N2 2.70%', 'Ar 1.60%', 'O2 0.13%', 'CO 0.08%', 'Other 0.17%'], datasets: [{ data: [95.32, 2.70, 1.60, 0.13, 0.08, 0.17], backgroundColor: ['#8b1a1a', '#1a4a8b', '#5a5a72', '#1a7a4a', '#c07000', '#aaaabc'], borderWidth: 1, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: true, position: 'right', labels: { font: { family: 'IBM Plex Mono', size: 8 }, color: '#5a5a72', boxWidth: 10, padding: 6 } }, tooltip: { bodyFont: { family: 'IBM Plex Mono', size: 10 } } } }
  });
}

function bindEvents() {
  byId('join-btn').addEventListener('click', () => studentJoinTeam(byId('join-code-input').value));
  byId('join-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') studentJoinTeam(byId('join-code-input').value);
  });
  byId('leave-session-btn').addEventListener('click', leaveSession);

  byId('pres-notes').addEventListener('input', function onInput() {
    const words = this.value.trim().split(/\s+/).filter(Boolean).length;
    byId('word-count').textContent = words + ' words';
  });
}

async function restoreSessionIfAny() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.joinCode) return;
    byId('join-code-input').value = parsed.joinCode;
    await studentJoinTeam(parsed.joinCode);
  } catch (_e) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

async function ensureSignedIn() {
  if (invalidConfig) return;
  try {
    await signInAnonymously(auth);
    authReady = true;
  } catch (err) {
    authReady = false;
    setLockState(formatFirebaseError(err, 'Anonymous auth failed. Enable Anonymous sign-in in Firebase Authentication.'), true);
  }
}

function init() {
  renderEquipment();
  renderSlots();
  renderBudget();
  renderRounds();
  renderLanguage();
  renderPresentation();
  updatePowerDashboard();
  bindEvents();

  setTimeout(installStaticCharts, 100);
  setLockState(invalidConfig ? 'Firebase config is incomplete. Fill firebase.config.js before use.' : 'Enter your team code. Your budget and team assignment will load automatically.', invalidConfig);

  if (solTick) clearInterval(solTick);
  solTick = setInterval(syncSolDisplayFromSessionState, 1000);

  authReadyPromise = ensureSignedIn();
  authReadyPromise.then(() => {
    restoreSessionIfAny();
  });
}

window.showSec = showSec;
window.toggleItem = toggleItem;
window.clearSel = clearSel;
window.selHab = selHab;
window.submitProposal = submitProposalSynced;
window.studentJoinTeam = studentJoinTeam;
window.submitProposalSynced = submitProposalSynced;
window.syncSolDisplayFromSessionState = syncSolDisplayFromSessionState;

init();
