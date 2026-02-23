import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onValue,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp as fsServerTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const cfg = window.FIREBASE_CONFIG || {};
const invalidConfig = !cfg.apiKey || cfg.projectId === 'REPLACE_ME' || cfg.databaseURL?.includes('REPLACE_ME');
const app = initializeApp(cfg);
const db = getDatabase(app);
const fs = getFirestore(app);

const { THRESH } = window.MarsSim;
const TEACHER_PIN = 'ARES';

let teacherUnlocked = false;
let sessionId = 'lesson7';
let sessionData = null;
let teamsData = {};
let latestData = {};
let unsubs = [];
let manualRows = [];

function byId(id) {
  return document.getElementById(id);
}

function showToast(msg, type) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function normalizeSessionId(value) {
  const clean = String(value || '').trim().toLowerCase();
  return clean.replace(/[^a-z0-9_-]/g, '') || 'lesson7';
}

function generateJoinCode(teamId) {
  const stem = String(teamId).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'TEAM';
  const rand = Math.random().toString(36).toUpperCase().slice(2, 7);
  return `${stem}-${rand}`;
}

function detachListeners() {
  unsubs.forEach((u) => {
    if (typeof u === 'function') u();
  });
  unsubs = [];
}

function statusChip(status) {
  if (status === 'RUNNING') return { cls: 'run', text: 'RUNNING' };
  if (status === 'FINISHED') return { cls: 'fin', text: 'FINISHED' };
  return { cls: 'lock', text: 'LOCKED' };
}

function updateSessionUi() {
  const status = sessionData?.status || 'LOCKED';
  const chip = statusChip(status);
  const el = byId('session-status-chip');
  el.className = `status-chip ${chip.cls}`;
  el.textContent = chip.text;

  const controlsEnabled = teacherUnlocked && !invalidConfig;
  byId('start-session-btn').disabled = !controlsEnabled;
  byId('finish-session-btn').disabled = !controlsEnabled;
  byId('reset-session-btn').disabled = !controlsEnabled;
  byId('add-team-row-btn').disabled = !controlsEnabled;

  if (invalidConfig) {
    byId('session-note').textContent = 'Firebase config is incomplete. Fill firebase.config.js before running.';
    return;
  }

  const teamCount = Object.keys(teamsData || {}).length;
  byId('session-note').textContent = `Session: ${sessionId} • Status: ${status} • Teams: ${teamCount}`;
}

function renderClassOverviewFromLatest() {
  const wrap = byId('class-overview-wrap');
  const teams = Object.keys(latestData || {});
  if (teams.length === 0) {
    wrap.innerHTML = '<div class="note">No submissions yet — waiting for teams</div>';
    return;
  }

  let html = `<table class="raw-table" style="min-width:760px"><thead><tr><th>TEAM ID</th><th>ROUND</th><th>MV SCORE</th><th>RS</th><th>ES</th><th>EP</th><th>BC</th><th>CS</th><th>STATUS</th><th>FAIL DAY</th></tr></thead><tbody>`;

  const scoreCell = (scores, idx) => {
    const v = Number(scores?.[idx] ?? 0);
    const th = THRESH[idx];
    const col = v >= th ? 'var(--green)' : (v >= th - 0.5 ? 'var(--orange)' : 'var(--red)');
    return `<span style="color:${col};font-weight:700">${v.toFixed(2)}</span>`;
  };

  teams.sort().forEach((teamId) => {
    const latest = latestData[teamId];
    const mv = Number(latest.mv || 0);
    const mvCol = mv >= 3 ? 'var(--green)' : 'var(--red)';
    const st = String(latest.status || 'CRITICAL').toUpperCase();
    const stColor = st === 'VIABLE' ? 'var(--green)' : (st === 'NON-VIABLE' ? 'var(--red)' : 'var(--orange)');
    const failDay = latest.failDay;

    html += `<tr>
      <td class="val">${teamId}</td>
      <td class="val">V${latest.round || '-'}</td>
      <td class="val"><span style="color:${mvCol};font-weight:700">${mv.toFixed(2)}</span></td>
      <td class="val">${scoreCell(latest.scores, 'RS')}</td>
      <td class="val">${scoreCell(latest.scores, 'ES')}</td>
      <td class="val">${scoreCell(latest.scores, 'EP')}</td>
      <td class="val">${scoreCell(latest.scores, 'BC')}</td>
      <td class="val">${scoreCell(latest.scores, 'CS')}</td>
      <td><span style="font-family:var(--font-mono);font-size:9px;color:${stColor};font-weight:700">${st}</span></td>
      <td class="val" style="text-align:center">${failDay !== null && failDay !== undefined ? `<span style="color:var(--red);font-weight:700">${failDay}</span>` : '-'}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function renderTeamRows() {
  const rows = [];
  Object.values(teamsData || {}).forEach((team) => {
    rows.push({
      mode: 'existing',
      originalTeamId: team.teamId,
      teamId: team.teamId,
      budgetMu: team.budgetMu || 12,
      joinCode: team.joinCode || ''
    });
  });

  manualRows.forEach((r) => rows.push({ ...r }));

  if (rows.length === 0) {
    rows.push({ mode: 'draft', originalTeamId: '', teamId: '', budgetMu: 12, joinCode: '' });
  }

  byId('team-rows').innerHTML = rows.map((row, idx) => `
    <div class="team-row" data-row-idx="${idx}">
      <input class="inp" id="team-id-${idx}" type="text" value="${row.teamId || ''}" placeholder="e.g. ALPHA-01" autocomplete="off">
      <select class="inp" id="team-budget-${idx}">
        <option value="13" ${Number(row.budgetMu) === 13 ? 'selected' : ''}>13 MU</option>
        <option value="12" ${Number(row.budgetMu) === 12 ? 'selected' : ''}>12 MU</option>
        <option value="11" ${Number(row.budgetMu) === 11 ? 'selected' : ''}>11 MU</option>
      </select>
      <input class="inp" id="team-code-${idx}" type="text" value="${row.joinCode || ''}" readonly>
      <button class="btn-sm" id="team-save-${idx}">SAVE</button>
      <button class="btn-sm" id="team-remove-${idx}" style="color:var(--red);border-color:var(--red)">REMOVE</button>
    </div>
  `).join('');

  rows.forEach((row, idx) => {
    byId(`team-save-${idx}`).addEventListener('click', async () => {
      const tid = String(byId(`team-id-${idx}`).value || '').trim().toUpperCase();
      const bud = Number(byId(`team-budget-${idx}`).value || 12);
      const existingJoinCode = byId(`team-code-${idx}`).value;
      if (!tid) {
        showToast('Team ID is required', 'err');
        return;
      }
      const code = existingJoinCode || generateJoinCode(tid);
      byId(`team-code-${idx}`).value = code;
      await teacherUpsertTeam(tid, bud, code, row.originalTeamId || null);
    });

    byId(`team-remove-${idx}`).addEventListener('click', async () => {
      const tid = String(byId(`team-id-${idx}`).value || '').trim().toUpperCase();
      if (!tid) {
        showToast('Team ID is required to remove', 'err');
        return;
      }
      await teacherRemoveTeam(tid);
    });
  });
}

async function teacherUpsertTeam(teamId, budgetMu, joinCode, originalTeamId) {
  if (!teacherUnlocked) {
    showToast('Unlock teacher controls first', 'err');
    return;
  }

  const normalizedTeamId = String(teamId).trim().toUpperCase();
  const normalizedBudget = [11, 12, 13].includes(Number(budgetMu)) ? Number(budgetMu) : 12;
  const existing = teamsData[normalizedTeamId];
  const code = String(joinCode || existing?.joinCode || generateJoinCode(normalizedTeamId)).trim().toUpperCase();

  const teamPayload = {
    teamId: normalizedTeamId,
    budgetMu: normalizedBudget,
    joinCode: code,
    submissionCount: Number(existing?.submissionCount || 0),
    lockedItems: Array.isArray(existing?.lockedItems) ? existing.lockedItems : [],
    currentRound: Number(existing?.currentRound || 1),
    lastSubmissionAt: existing?.lastSubmissionAt || null,
    active: true
  };

  try {
    await set(ref(db, `sessions/${sessionId}/teams/${normalizedTeamId}`), teamPayload);
    await set(ref(db, `joinCodes/${code}`), {
      sessionId,
      teamId: normalizedTeamId,
      active: true,
      updatedAt: Date.now()
    });

    if (originalTeamId && originalTeamId !== normalizedTeamId && teamsData[originalTeamId]) {
      const oldCode = teamsData[originalTeamId].joinCode;
      await remove(ref(db, `sessions/${sessionId}/teams/${originalTeamId}`));
      await remove(ref(db, `sessions/${sessionId}/latest/${originalTeamId}`));
      if (oldCode && oldCode !== code) {
        await remove(ref(db, `joinCodes/${oldCode}`));
      }
    }

    manualRows = manualRows.filter((r) => String(r.teamId || '').toUpperCase() !== normalizedTeamId);
    showToast(`Team ${normalizedTeamId} saved`);
  } catch (_err) {
    showToast('Failed to save team', 'err');
  }
}

async function teacherRemoveTeam(teamId) {
  if (!teacherUnlocked) {
    showToast('Unlock teacher controls first', 'err');
    return;
  }

  const tid = String(teamId || '').trim().toUpperCase();
  if (!tid) return;

  const existing = teamsData[tid];
  try {
    await remove(ref(db, `sessions/${sessionId}/teams/${tid}`));
    await remove(ref(db, `sessions/${sessionId}/latest/${tid}`));
    if (existing?.joinCode) await remove(ref(db, `joinCodes/${existing.joinCode}`));
    manualRows = manualRows.filter((r) => String(r.teamId || '').toUpperCase() !== tid);
    showToast(`Team ${tid} removed`);
  } catch (_err) {
    showToast('Failed to remove team', 'err');
  }
}

async function teacherStartSession() {
  if (!teacherUnlocked) {
    showToast('Unlock teacher controls first', 'err');
    return;
  }

  try {
    await update(ref(db, `sessions/${sessionId}`), {
      status: 'RUNNING',
      solBase: 1,
      solStartAt: Date.now(),
      finishedAt: null,
      updatedAt: serverTimestamp()
    });
    showToast('Simulation started');
  } catch (_err) {
    showToast('Failed to start simulation', 'err');
  }
}

async function teacherFinishSession() {
  if (!teacherUnlocked) {
    showToast('Unlock teacher controls first', 'err');
    return;
  }

  try {
    await update(ref(db, `sessions/${sessionId}`), {
      status: 'FINISHED',
      finishedAt: Date.now(),
      updatedAt: serverTimestamp()
    });
    showToast('Simulation finished (students hard-locked)');
  } catch (_err) {
    showToast('Failed to finish simulation', 'err');
  }
}

async function teacherResetSession() {
  if (!teacherUnlocked) {
    showToast('Unlock teacher controls first', 'err');
    return;
  }

  if (!window.confirm('Reset this session? Teams keep their join codes, but rounds/submissions are reset and latest overview is cleared.')) {
    return;
  }

  try {
    const updates = {
      [`sessions/${sessionId}/status`]: 'LOCKED',
      [`sessions/${sessionId}/solBase`]: 1,
      [`sessions/${sessionId}/solStartAt`]: null,
      [`sessions/${sessionId}/finishedAt`]: null,
      [`sessions/${sessionId}/updatedAt`]: serverTimestamp(),
      [`sessions/${sessionId}/latest`]: null
    };

    Object.keys(teamsData || {}).forEach((tid) => {
      updates[`sessions/${sessionId}/teams/${tid}/submissionCount`] = 0;
      updates[`sessions/${sessionId}/teams/${tid}/lockedItems`] = [];
      updates[`sessions/${sessionId}/teams/${tid}/currentRound`] = 1;
      updates[`sessions/${sessionId}/teams/${tid}/lastSubmissionAt`] = null;
      updates[`sessions/${sessionId}/teams/${tid}/active`] = true;
    });

    await update(ref(db), updates);

    await addDoc(collection(fs, `sessionSubmissions/${sessionId}/events`), {
      type: 'RESET',
      at: fsServerTimestamp(),
      actor: 'TEACHER'
    });

    showToast('Session reset complete');
  } catch (_err) {
    showToast('Failed to reset session', 'err');
  }
}

function bindSessionListeners() {
  detachListeners();
  unsubs.push(onValue(ref(db, `sessions/${sessionId}`), (snap) => {
    sessionData = snap.val() || null;
    updateSessionUi();
  }));
  unsubs.push(onValue(ref(db, `sessions/${sessionId}/teams`), (snap) => {
    teamsData = snap.val() || {};
    renderTeamRows();
    updateSessionUi();
  }));
  unsubs.push(onValue(ref(db, `sessions/${sessionId}/latest`), (snap) => {
    latestData = snap.val() || {};
    renderClassOverviewFromLatest();
  }));
}

function unlockCheck() {
  const pin = byId('pin-input').value;
  teacherUnlocked = pin === TEACHER_PIN;
  const statusEl = byId('pin-status');
  statusEl.className = teacherUnlocked ? 'pin-status ok' : 'pin-status bad';
  statusEl.textContent = teacherUnlocked ? 'UNLOCKED' : 'LOCKED';
  updateSessionUi();
}

function connectSession() {
  sessionId = normalizeSessionId(byId('session-id').value);
  byId('session-id').value = sessionId;
  manualRows = [];
  bindSessionListeners();
  showToast(`Connected to session ${sessionId}`);
}

function bindEvents() {
  byId('unlock-btn').addEventListener('click', unlockCheck);
  byId('pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockCheck();
  });

  byId('connect-session-btn').addEventListener('click', connectSession);
  byId('start-session-btn').addEventListener('click', teacherStartSession);
  byId('finish-session-btn').addEventListener('click', teacherFinishSession);
  byId('reset-session-btn').addEventListener('click', teacherResetSession);

  byId('add-team-row-btn').addEventListener('click', () => {
    manualRows.push({ mode: 'draft', originalTeamId: null, teamId: '', budgetMu: 12, joinCode: '' });
    renderTeamRows();
  });
}

function init() {
  if (invalidConfig) {
    byId('session-note').textContent = 'Firebase config is incomplete. Fill firebase.config.js before running.';
  }
  bindEvents();
  connectSession();
  updateSessionUi();
}

window.teacherStartSession = teacherStartSession;
window.teacherFinishSession = teacherFinishSession;
window.teacherResetSession = teacherResetSession;
window.teacherUpsertTeam = teacherUpsertTeam;
window.teacherRemoveTeam = teacherRemoveTeam;
window.renderClassOverviewFromLatest = renderClassOverviewFromLatest;

init();
