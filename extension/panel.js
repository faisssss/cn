// CN Desk side panel. One student at a time; nothing is written to disk.
// Student data lives in memory and in chrome.storage.session (memory-only, cleared when Chrome closes).
import * as IMG from './imaging.js';
import { CLAUDE_PROMPT, parseClaudeReply, buildDetails, derived, checkDetails, DEFAULT_OPTIONS, lettersOnly } from './extract.js';

// ---------------------------------------------------------------- constants

const STEPS = [['start', '1 Start'], ['scan', '2 Scan'], ['read', '3 Read'], ['review', '4 Review'], ['labels', '5 Labels & files'], ['pariksha', '6 Pariksha']];
const DOCS = [
  { key: 'sign', name: 'Signature sheet' },
  { key: 'cert10', name: '10th pass certificate', label: 'sl3_5', slots: '3 + 5', w: 0.55 },
  { key: 'marks10', name: '10th marksheet', label: 'sl4', slots: '4', w: 0.42 },
  { key: 'cert12', name: '12th certificate', label: 'sl7_9', slots: '7 + 9', w: 0.6 },
  { key: 'aadhaar', name: 'Aadhaar (card form)', label: 'sl10_11', slots: '10 + 11', w: 0.68 },
];
const LABELLED = DOCS.filter(d => d.label);
const HAS_PHOTO = ['cert10', 'cert12', 'aadhaar']; // documents with the student's photo on them
const SLOTS = [
  { row: 1, title: 'Applicant Photograph', file: 'photo' },
  { row: 2, title: 'Applicant Signature', file: 'sign' },
  { row: 3, title: 'Date of Birth Proof', file: 'cert10' },
  { row: 4, title: 'Xth Marksheet', file: 'marks10' },
  { row: 5, title: 'Xth Pass Certificate', file: 'cert10' },
  { row: 6, title: 'BVC for Xth', file: 'b10', docNumber: 'BVC already in DGCA' },
  { row: 7, title: 'XIIth Pass Certificate', file: 'cert12' },
  { row: 8, title: 'BVC for XIIth', file: 'b12', docNumber: 'BVC already in DGCA' },
  { row: 9, title: 'XIIth Marksheet', file: 'cert12' },
  { row: 10, title: 'UID Aadhar Card', file: 'aadhaar' },
  { row: 11, title: 'Proof of Permanent Address', file: 'aadhaar' },
];
const PAGE_NAMES = {
  welcome: 'Welcome page', home: 'Home (login module)', terms: 'Instructions', digichoice: 'DigiLocker question',
  register: 'New Candidate Registration', login: 'Candidate Login', digiskip: 'DigiLocker fetch',
  personal: 'Personal details', flight: 'Flight crew details', documents: 'Documents', unknown: 'Another page',
};
const ROUTINE = ['welcome', 'home', 'terms', 'digichoice', 'digiskip'];
const PARIKSHA = 'https://pariksha.dgca.gov.in/';

// ---------------------------------------------------------------- state

const fresh = () => ({
  step: 'start', contact: { mobile: '', email: '', gender: '' },
  photo: null, bvc: {}, docMeta: {}, reply: null, details: null, edited: {}, dismissed: [],
  options: { ...DEFAULT_OPTIONS }, confirmed: false, labels: {}, files: {}, stage: 'register',
  pariksha: {}, lastReport: null, claudeDl: null,
});
let S = fresh();
const M = { photo: null, pages: {}, labelImgs: {}, pageKind: null, tabId: null, busy: '' }; // memory only
let settings = { routineAuto: true, labelPos: {} };
globalThis.__cnMem = M; globalThis.__cnState = () => S; // for tests

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// chrome.storage.session lives in memory only (never on disk) and is cleared when Chrome closes.
// Built document files are not stored (they are rebuilt from the pages when needed) to stay within its 10 MB.
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const keep = {}; for (const k of ['photo', 'b10', 'b12']) if (S.files[k]) keep[k] = S.files[k];
    try { await chrome.storage.session.set({ cn: { ...S, files: keep } }); }
    catch (e) { console.warn('session save failed', e); }
  }, 300);
}
let imgT = 0, warnedQuota = false;
function saveImages() {
  clearTimeout(imgT);
  imgT = setTimeout(async () => {
    const pages = {};
    for (const [k, list] of Object.entries(M.pages)) pages[k] = (list || []).map(p => IMG.scaleTo(p.cur, 2000).toDataURL('image/jpeg', 0.85));
    const photo = M.photo ? IMG.scaleTo(M.photo, 1600).toDataURL('image/jpeg', 0.9) : null;
    try { await chrome.storage.session.set({ cnImg: { pages, photo } }); }
    catch (e) {
      console.warn('image save failed', e);
      if (!warnedQuota) { warnedQuota = true; toast('Too much to keep if the panel is closed – keep the panel open until the files are attached.', 7000); }
    }
  }, 500);
}
async function loadImages() {
  try {
    const { cnImg } = await chrome.storage.session.get('cnImg');
    if (!cnImg) return;
    for (const [k, urls] of Object.entries(cnImg.pages || {})) {
      M.pages[k] = [];
      for (const u of urls) { const c = await IMG.canvasFromURL(u); M.pages[k].push({ orig: c, cur: c, warn: [], thumb: IMG.scaleTo(c, 200).toDataURL('image/jpeg', 0.7) }); }
    }
    if (cnImg.photo) {
      M.photo = await IMG.canvasFromURL(cnImg.photo);
      const p = S.photo;   // the kept copy may be smaller than the original: scale the crop to match
      if (p && p.srcW && p.srcW !== M.photo.width) {
        const k = M.photo.width / p.srcW;
        p.rect = { ...p.rect, x: p.rect.x * k, y: p.rect.y * k, w: p.rect.w * k, h: p.rect.h * k }; p.srcW = M.photo.width;
      }
    }
  } catch (e) { console.warn('could not restore images', e); }
}
async function load() {
  try { const r = await chrome.storage.session.get('cn'); if (r.cn) S = Object.assign(fresh(), r.cn); } catch (e) { /* ignore */ }
  await loadImages();
  try { const r = await chrome.storage.local.get('settings'); if (r.settings) settings = Object.assign(settings, r.settings); } catch (e) { /* ignore */ }
}
const saveSettings = () => chrome.storage.local.set({ settings }).catch(() => {});

function toast(msg, ms = 3000) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}
function busy(msg) { M.busy = msg; render(); }

// ---------------------------------------------------------------- step completion

const validMobile = m => /^\d{10}$/.test(m || '');
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');
const hasPages = k => (M.pages[k] && M.pages[k].length) || (S.docMeta[k] && S.docMeta[k].pages);
const doneMap = () => ({
  start: validMobile(S.contact.mobile) && validEmail(S.contact.email) && !!S.contact.gender && !!S.photo && !!S.bvc.b10 && !!S.bvc.b12,
  scan: DOCS.every(d => hasPages(d.key)),
  read: !!S.reply,
  review: !!S.confirmed,
  labels: ['photo', 'sign', 'cert10', 'marks10', 'cert12', 'aadhaar', 'b10', 'b12'].every(k => S.files[k]),
  pariksha: !!S.pariksha.documents,
});
const studentName = () => S.details ? derived(S.details).fullName : '';

// ---------------------------------------------------------------- render

function render() {
  $('#who').textContent = studentName();
  const done = doneMap();
  $('#steps').innerHTML = STEPS.map(([k, t]) => `<button data-step="${k}" class="${S.step === k ? 'on' : ''} ${done[k] ? 'done' : ''}">${t}</button>`).join('');
  const v = { start: vStart, scan: vScan, read: vRead, review: vReview, labels: vLabels, pariksha: vPariksha }[S.step]();
  $('#view').innerHTML = (M.busy ? `<div class="card"><span class="spin"></span> ${esc(M.busy)}</div>` : '') + v;
  if (S.step === 'labels') drawAllLabelCanvases();
}

function next(step, label = 'Next') { return `<button class="primary big" data-go="${step}">${label} →</button>`; }

// ---- 1 Start
function vStart() {
  const c = S.contact, p = S.photo;
  const bvcBox = (k, name) => {
    const b = S.bvc[k];
    return `<div class="box ${b ? '' : 'empty'}"><div class="meta"><div class="name">${name}</div>
      ${b ? `<div class="small">${esc(b.name)} · ${b.pages} page${b.pages === 1 ? '' : 's'} · ${b.kb} KB
        ${b.changed ? `<span class="pill orange">shrunk to fit 500 KB</span>` : `<span class="pill ok">used as-is</span>`}</div>
        ${b.pages !== 2 ? `<div class="warn">Expected 2 pages (BVC + board-verified copy) – this file has ${b.pages}.</div>` : ''}`
        : '<div class="muted small">Final, handwritten-labelled file (PDF or image)</div>'}</div>
      <label class="file small">${b ? 'Replace' : 'Upload'}<input type="file" data-bvc="${k}" accept="application/pdf,image/*"></label></div>`;
  };
  return `
  <div class="card"><h3>Contact (not on any document)</h3>
    <label class="f">Mobile<input type="tel" data-c="mobile" maxlength="10" value="${esc(c.mobile)}" placeholder="10 digits"></label>
    ${c.mobile && !validMobile(c.mobile) ? '<div class="warn">Mobile must be exactly 10 digits</div>' : ''}
    <label class="f">Email<input type="email" data-c="email" value="${esc(c.email)}"></label>
    ${c.email && !validEmail(c.email) ? '<div class="warn">This does not look like an email</div>' : ''}
    <div class="row">Gender:
      <label class="toggle"><input type="radio" name="g" data-c="gender" value="Male" ${c.gender === 'Male' ? 'checked' : ''}> Male (Mr)</label>
      <label class="toggle"><input type="radio" name="g" data-c="gender" value="Female" ${c.gender === 'Female' ? 'checked' : ''}> Female (Ms)</label>
    </div>
  </div>
  <div class="card"><h3>Photo <span class="muted small">631×645, under 195 KB, face ≈ 70%</span></h3>
    ${p ? `<div class="row"><img class="photo-prev" src="${p.url}">
        <div><div><span class="pill ok">${p.kb} KB ✓</span></div>
        ${p.found ? '' : '<div class="warn">No face found – please adjust the crop by hand.</div>'}
        <div class="row"><button data-act="photoEdit" ${M.photo ? '' : 'disabled'}>Adjust crop</button>
        <label class="file small">Replace<input type="file" data-photo accept="image/*"></label></div>
        ${M.photo ? '' : '<div class="muted small">Re-add the photo to adjust the crop.</div>'}</div></div>`
      : `<div class="drop" data-drop="photo">Drop the studio JPG here, or <label class="file small">choose file<input type="file" data-photo accept="image/*"></label></div>`}
  </div>
  <div class="card"><h3>BVCs <span class="muted small">2 pages each, used exactly as given</span></h3>
    ${bvcBox('b10', 'BVC 10th')}${bvcBox('b12', 'BVC 12th')}
  </div>
  ${next('scan')}`;
}

// ---- 2 Scan
function vScan() {
  const box = d => {
    const pages = M.pages[d.key] || [], meta = S.docMeta[d.key];
    const thumbs = pages.length ? pages.map((p, i) => `<span class="th"><img src="${p.thumb}" data-edit="${d.key}:${i}" title="Click to crop / clean up">
        <span class="rot"><button class="small" data-rot="${d.key}:${i}:-1" title="Turn left">⟲</button><button class="small" data-rot="${d.key}:${i}:1" title="Turn right">⟳</button></span></span>`).join('')
      : (meta && meta.thumbs || []).map(t => `<img src="${t}">`).join('');
    const warns = pages.flatMap(p => p.warn);
    const lost = !pages.length && meta && meta.pages;
    return `<div class="box ${pages.length || lost ? '' : 'empty'}">
      <div class="meta"><div class="name">${d.name} ${d.slots ? `<span class="muted small">→ Sl. No ${d.slots}</span>` : ''}</div>
        <div class="thumbs">${thumbs || '<span class="muted small">empty</span>'}</div>
        ${[...new Set(warns)].map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
        ${lost ? '<div class="muted small">Pages are not kept after the panel was closed. Built files are kept; re-add only if you need to change this one.</div>' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label class="file small">${pages.length ? 'Replace' : 'Upload'}<input type="file" data-doc="${d.key}" accept="application/pdf,image/*" multiple></label>
        ${pages.length ? `<button class="small" data-clear="${d.key}">Remove</button>` : ''}
      </div></div>`;
  };
  return `
  <div class="card"><h3>Scanned stack</h3>
    <p class="muted small">Feeder order (top first): 1 signature · 2 10th pass certificate · 3 10th marksheet · 4 12th certificate · 5 Aadhaar.
      Drop the one PDF here – pages go into the <b>empty</b> boxes in order.</p>
    <div class="drop" data-drop="stack">Drop the scanned PDF here, or <label class="file small">choose file<input type="file" data-stack accept="application/pdf,image/*" multiple></label></div>
  </div>
  <div class="card"><h3>Documents</h3>${DOCS.map(box).join('')}
    <p class="muted small">Wrong box? Use Replace on the right box. Click a page to rotate or re-crop it.</p></div>
  ${next('read')}`;
}

// ---- 3 Read
function vRead() {
  const ready = ['cert10', 'marks10', 'cert12', 'aadhaar'].every(k => M.pages[k] && M.pages[k].length);
  return `
  <div class="card"><h3>Read the details with Claude</h3>
    <ol class="howto">
      <li>Press <b>Prepare for Claude</b>. A PDF is saved to Downloads and the instruction is copied.</li>
      <li>Open Claude, paste (Ctrl+V), attach the PDF from Downloads, send.</li>
      <li>Copy Claude's whole answer and paste it below.</li>
    </ol>
    <div class="row"><button class="primary" data-act="prepClaude" ${ready ? '' : 'disabled'}>Prepare for Claude</button>
      <button data-act="copyPrompt">Copy instruction again</button>
      <button data-act="openClaude">Open Claude</button></div>
    ${ready ? '' : '<div class="warn">Add the 10th certificate, 10th marksheet, 12th certificate and Aadhaar first (step 2).</div>'}
  </div>
  <div class="card"><h3>Claude's answer</h3>
    <textarea id="reply" rows="8" placeholder="Paste the whole answer here">${S.reply ? esc(JSON.stringify(S.reply, null, 1)) : ''}</textarea>
    <div class="row"><button class="primary" data-act="useReply">Use this answer</button>
      ${S.reply ? '<span class="pill ok">Answer loaded ✓</span>' : ''}</div>
    <div id="replyErr" class="warn"></div>
  </div>
  ${S.reply ? next('review') : ''}`;
}

// ---- 4 Review
const FIELDS = [
  ['Name (as on 10th certificate)', [['title', 'Title', 'sel:Mr,Ms,Other'], ['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name']]],
  ['Parents', [['mother', "Mother's name"], ['father', "Father's name"]]],
  ['Personal', [['dob', 'Date of birth (DD-MM-YYYY)'], ['gender', 'Gender', 'sel:Male,Female,Other'], ['aadhaar', 'Aadhaar number'], ['mobile', 'Mobile'], ['email', 'Email']]],
  ['Address (from Aadhaar)', [['addr1', 'Address line 1'], ['addr2', 'Address line 2'], ['addr3', 'Address line 3'], ['city', 'Village / Town / City'], ['state', 'State'], ['pin', 'PIN']]],
  ['10th', [['y10', 'Year of passing'], ['m10obt', 'Marks obtained', 'num'], ['m10max', 'Maximum marks', 'num']]],
  ['12th', [['y12', 'Year of passing'], ['m12obt', 'Total obtained', 'num'], ['m12max', 'Total maximum', 'num'],
    ['maths', 'Maths (/200)', 'num'], ['phy', 'Physics (/200)', 'num'], ['eng', 'English (/200)', 'num']]],
];
const OPTION_ROWS = [
  ['category', 'Registration category', ['CPL', 'PPL', 'ATPL', 'FDEG', 'FATA', 'SFE', 'FN']],
  ['nationality', 'Nationality', ['INDIA', 'NEPAL', 'BHUTAN']],
  ['licence', 'Holding licence (Indian/foreign authority)', ['NO', 'YES']],
  ['govt', 'Govt employee', ['NO', 'YES']],
  ['defence', 'Defence pilot', ['NO', 'YES']],
  ['abroad', 'Studied in foreign university', ['NO', 'YES']],
  ['sameAddress', 'Permanent address same as correspondence', ['YES', 'NO']],
  ['additionalDoc', 'Additional document / affidavit', ['NO', 'YES']],
];
function currentWarnings() {
  if (!S.details) return [];
  return checkDetails(S.details, S.reply).filter(w => !S.dismissed.includes(w.id));
}
function vReview() {
  if (!S.details) return `<div class="card">Paste Claude's answer first (step 3).</div>`;
  const d = S.details, dv = derived(d), warns = currentWarnings();
  const levelOf = k => (warns.find(w => w.field === k && w.level === 'red') ? 'red' : warns.find(w => w.field === k) ? 'orange' : '');
  const input = ([k, label, type]) => {
    const lv = levelOf(k), cls = `f ${lv ? 'field-' + lv : ''}`;
    const lab = `<span class="${S.edited[k] ? 'edited' : ''}">${label}</span>`;
    if (type && type.startsWith('sel:')) {
      return `<label class="${cls}">${lab}<select data-d="${k}">${type.slice(4).split(',').map(o => `<option ${d[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    }
    return `<label class="${cls}">${lab}<input type="text" data-d="${k}" ${type === 'num' ? 'inputmode="numeric"' : ''} value="${esc(d[k] ?? '')}"></label>`;
  };
  return `
  <div class="card warnlist"><h3>Checks ${warns.length ? `<span class="pill red">${warns.filter(w => w.level === 'red').length} red</span> <span class="pill orange">${warns.filter(w => w.level === 'orange').length} orange</span>` : '<span class="pill ok">all clear</span>'}</h3>
    ${warns.map(w => `<div class="w ${w.level}"><span>${esc(w.text)}</span><button class="small" data-dismiss="${esc(w.id)}">It's correct</button></div>`).join('') || '<div class="muted small">No problems found.</div>'}
  </div>
  ${FIELDS.map(([title, fs]) => `<div class="card"><h3>${title}</h3><div class="grid2">${fs.map(input).join('')}</div>
    ${title === '10th' ? `<div class="small">Percentage: <b>${dv.p10 || '–'}</b> <span class="muted">(cut off after 2 decimals)</span></div>` : ''}
    ${title === '12th' ? `<div class="small">Percentage: <b>${dv.p12 || '–'}</b> · Board: Kerala Board of Higher Secondary Education · pass 64</div>` : ''}
  </div>`).join('')}
  <div class="card opts"><h3>Student options <span class="muted small">(this student only)</span></h3>
    ${OPTION_ROWS.map(([k, label, vals]) => `<div class="row"><span>${label}</span><select data-o="${k}">${vals.map(v => `<option ${S.options[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}
    <p class="muted small">Training & flying, passport and visa are always left blank.</p>
  </div>
  <button class="primary big" data-act="confirm">${S.confirmed ? 'Details confirmed ✓ – continue' : 'Confirm details'} →</button>`;
}

// ---- 5 Labels & files
function labelState(d) {
  if (!S.labels[d.key]) {
    const pos = settings.labelPos[d.key] || { x: 0.05, y: 0.015, w: d.w, rot: 0 };
    S.labels[d.key] = { rot: 0, ...pos, on: true, space: null };
  }
  return S.labels[d.key];
}
function vLabels() {
  const f = S.files;
  const canBuild = canBuildFiles();
  const slotRow = s => {
    const file = f[s.file];
    return `<div class="s"><b>${s.row}</b><span class="t">${s.title}${s.docNumber ? ` <span class="muted small">+ "${s.docNumber}"</span>` : ''}</span>
      ${file ? `<span class="pill ${file.kb * 1024 <= limitFor(s.file) ? 'ok' : 'red'}">${file.type === 'application/pdf' ? 'PDF' : 'JPG'} ${file.kb} KB</span>` : '<span class="pill">not built</span>'}</div>`;
  };
  return `
  <div class="card"><h3>Handwritten labels</h3>
    <p class="muted small">Drag a label to move it, drag its corner ◢ to resize, ✕ to remove it (e.g. already written by hand).</p>
    ${LABELLED.map(d => {
      const l = labelState(d), ok = M.pages[d.key] && M.pages[d.key].length;
      return `<div class="card"><div class="row"><b>${d.name}</b><span class="muted small">Sl. No ${d.slots}</span><span class="spacer"></span>
        ${l.on ? `<button class="small" data-lab-rot="${d.key}" title="Turn the label 90°">⟳ Turn label</button> <button class="small" data-lab-off="${d.key}">✕ Remove label</button>` : `<button class="small" data-lab-on="${d.key}">+ Add label</button>`}</div>
        ${ok ? `<div class="labelwrap"><canvas data-labcanvas="${d.key}"></canvas></div>
          ${l.on ? `<label class="toggle small"><input type="checkbox" data-lab-space="${d.key}" ${l.space ? 'checked' : ''}> Add white space on top for the label</label>` : ''}`
          : '<div class="muted small">Add this document in step 2 to place its label.</div>'}
      </div>`;
    }).join('')}
  </div>
  <div class="card"><h3>Files for Pariksha</h3>
    <div class="slotlist">${SLOTS.map(slotRow).join('')}</div>
    <div class="row"><button class="primary" data-act="build" ${canBuild ? '' : 'disabled'}>${doneMap().labels ? 'Rebuild files' : 'Build files'}</button>
      ${canBuild ? '' : '<span class="warn">Needs photo, BVCs and all 5 scanned documents.</span>'}</div>
  </div>
  ${doneMap().labels ? next('pariksha', 'Go to Pariksha') : ''}`;
}
function canBuildFiles() { return DOCS.every(d => M.pages[d.key] && M.pages[d.key].length) && !!S.photo && !!S.bvc.b10 && !!S.bvc.b12; }
const allBuilt = () => ['photo', 'sign', 'cert10', 'marks10', 'cert12', 'aadhaar', 'b10', 'b12'].every(k => S.files[k]);
// open step 5 or attach → build whatever is missing, without asking
async function ensureBuilt() { if (!allBuilt() && canBuildFiles() && !M.busy) await buildFiles({ quiet: true }); }
const limitFor = k => (k === 'photo' ? IMG.LIMITS.photo : k === 'sign' ? IMG.LIMITS.sign : IMG.LIMITS.pdf);

// ---- 6 Pariksha
function vPariksha() {
  const k = M.pageKind, rep = S.lastReport && S.lastReport.kind === k ? S.lastReport : null;
  const status = n => S.pariksha[n] ? '<span class="pill ok">done</span>' : '';
  const fillable = ['register', 'personal', 'flight', 'login'].includes(k);
  let action = '';
  if (!k) action = `<p>Open Pariksha in this window.</p><button class="primary big" data-act="openPariksha">Open Pariksha</button>`;
  else if (fillable) action = `<button class="primary big" data-act="fill">${S.pariksha[k] ? 'Re-fill this page' : 'Fill this page'}</button>`;
  else if (k === 'documents') action = `<button class="primary big" data-act="attach" ${allBuilt() || canBuildFiles() ? '' : 'disabled'}>Attach all 11 files</button>
      ${allBuilt() || canBuildFiles() ? '' : '<div class="warn">Some documents are missing – check steps 1 and 2.</div>'}`;
  else if (ROUTINE.includes(k)) action = `<button class="big" data-act="routine">${routineLabel(k)}</button>`;
  else action = '<p class="muted">Not a page CN Desk fills.</p>';
  return `
  <div class="card"><h3>You are on: <span class="page-now">${k ? PAGE_NAMES[k] : 'no Pariksha tab'}</span></h3>
    ${!S.confirmed && (fillable || k === 'documents') ? '<div class="warn">Confirm the details in step 4 first.</div>' : ''}
    ${action}
    ${k === 'home' ? `<div class="row small">Next from Home:
      <label class="toggle"><input type="radio" name="stage" data-stage="register" ${S.stage === 'register' ? 'checked' : ''}> New registration</label>
      <label class="toggle"><input type="radio" name="stage" data-stage="login" ${S.stage === 'login' ? 'checked' : ''}> Candidate login</label></div>` : ''}
  </div>
  ${rep ? vReport(rep) : ''}
  ${['register', 'flight', 'documents'].includes(k) && S.details ? vFinal(k) : ''}
  <div class="card"><h3>Progress</h3>
    <div class="slotlist">
      <div class="s"><span class="t">Registration form</span>${status('register')}</div>
      <div class="s"><span class="t">Login (email)</span>${status('login')}</div>
      <div class="s"><span class="t">Personal details</span>${status('personal')}</div>
      <div class="s"><span class="t">Flight crew details</span>${status('flight')}</div>
      <div class="s"><span class="t">Documents attached</span>${status('documents')}</div>
    </div>
    <label class="toggle small" style="margin-top:8px"><input type="checkbox" data-act="routineToggle" ${settings.routineAuto ? 'checked' : ''}>
      Do routine clicks automatically (Proceed, New Registration / Candidate Login, Instructions tick + Submit, DigiLocker No / Skip)</label>
  </div>`;
}
function routineLabel(k) {
  return { welcome: 'Click "Click Here To Proceed"', home: S.stage === 'login' ? 'Click Flight Crew → Candidate Login' : 'Click Flight Crew → NEW Candidate Registration',
    terms: 'Tick "I have read" and press Submit', digichoice: 'Click "No"', digiskip: 'Click "Skip Digilocker step"' }[k];
}
function vReport(r) {
  if (r.error) return `<div class="card"><span class="warn">${esc(r.error)}</span></div>`;
  return `<div class="card report"><h3><span class="filled">${r.filled.length} filled</span>${r.failed.length ? ` · <span class="failed">${r.failed.length} need you</span>` : ' · 0 problems'}</h3>
    ${r.failed.length ? `<ul class="failed">${r.failed.map(f => `<li><b>${esc(f.label)}</b>: ${esc(f.why)}</li>`).join('')}</ul>` : ''}
    ${r.checks && r.checks.length ? `<table class="checks"><tr><td></td><td class="muted">On Pariksha</td><td class="muted">Checked details</td></tr>${r.checks.map(c => `<tr><td>${esc(c.label)}</td><td class="${c.same ? '' : 'bad'}">${esc(c.onSite)}</td><td>${esc(c.ours)}</td></tr>`).join('')}</table>
      ${r.checks.some(c => !c.same) ? '<div class="warn">Some locked fields differ from the checked details (they were typed at registration).</div>' : ''}` : ''}
    ${(r.notes || []).map(n => `<div class="small">• ${esc(n)}</div>`).join('')}
    <details class="small"><summary>What was filled</summary>${r.filled.map(esc).join(' · ')}</details></div>`;
}
function vFinal(k) {
  const d = S.details, dv = derived(d), reds = currentWarnings().filter(w => w.level === 'red');
  let rows = [];
  if (k === 'register') rows = [['Name', `${d.title} / ${d.firstName} / ${d.middleName || '–'} / ${d.lastName || '–'}`], ['Mother', d.mother], ['Father', d.father],
    ['DOB', d.dob], ['Gender', d.gender], ['Aadhaar', d.aadhaar], ['Mobile', d.mobile], ['Email', d.email], ['1.15', 'Never registered with DGCA – ticked']];
  if (k === 'flight') rows = [['Category', S.options.category], ['10th', `Kerala Board of Public Examination · ${d.y10} · ${d.m10obt}/${d.m10max} · ${dv.p10}%`],
    ['12th', `10+2 with PM · Kerala Board of Higher Secondary Education · ${d.y12} · ${d.m12obt}/${d.m12max} · ${dv.p12}%`],
    ['Subjects', `Maths ${d.maths} · Physics ${d.phy} · English ${d.eng} (/200, pass 64)`],
    ['Answers', OPTION_ROWS.slice(2).filter(o => o[0] !== 'sameAddress').map(o => `${o[1].split(' (')[0]}: ${S.options[o[0]]}`).join(' · ')]];
  if (k === 'documents') rows = SLOTS.map(s => [s.row, `${s.title} – ${S.files[s.file] ? S.files[s.file].kb + ' KB' : 'missing'}${s.docNumber ? ` · "${s.docNumber}"` : ''}`]);
  const btn = { register: 'Submit', flight: 'Save and Next', documents: 'Save and Next' }[k];
  return `<div class="card final"><h3>Final check before you press ${btn}</h3>
    <div class="small">This cannot be edited after it is submitted.</div>
    <dl>${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
    ${reds.length ? `<div class="warn">${reds.length} red check(s) still open in step 4.</div>` : '<span class="pill ok">No open red checks</span>'}</div>`;
}

// ---------------------------------------------------------------- events

document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-edit], input[type=checkbox][data-act]');
  if (!t) return;
  if (t.dataset.step || t.dataset.go) {
    S.step = t.dataset.step || t.dataset.go; save(); render(); window.scrollTo(0, 0);
    if (S.step === 'pariksha') refreshTab();
    if (S.step === 'labels' || S.step === 'pariksha') ensureBuilt();
    return;
  }
  if (t.dataset.edit) { const [k, i] = t.dataset.edit.split(':'); return openPageEditor(k, +i); }
  if (t.dataset.rot) {
    const [k, i, dir] = t.dataset.rot.split(':'), p = M.pages[k][+i];
    p.cur = IMG.rotate90(p.cur, +dir); p.thumb = IMG.scaleTo(p.cur, 200).toDataURL('image/jpeg', 0.7);
    p.warn = p.warn.filter(w => !/sideways/.test(w));
    storeMeta(k); invalidateFiles([k]); save(); return render();
  }
  if (t.dataset.clear) { delete M.pages[t.dataset.clear]; delete S.docMeta[t.dataset.clear]; invalidateFiles([t.dataset.clear]); saveImages(); save(); return render(); }
  if (t.dataset.dismiss) { S.dismissed.push(t.dataset.dismiss); save(); return render(); }
  if (t.dataset.labOff) { labelState(byKey(t.dataset.labOff)).on = false; labelsChanged(t.dataset.labOff); return render(); }
  if (t.dataset.labOn) { labelState(byKey(t.dataset.labOn)).on = true; labelsChanged(t.dataset.labOn); return render(); }
  if (t.dataset.labRot) {
    const d = byKey(t.dataset.labRot), l = labelState(d);
    l.rot = ((l.rot || 0) + 90) % 360; l.x = Math.min(l.x, 0.9); l.y = Math.min(l.y, 0.9);
    settings.labelPos[d.key] = { x: l.x, y: l.y, w: l.w, rot: l.rot }; saveSettings();
    labelsChanged(d.key); return render();
  }
  const act = t.dataset.act;
  try {
    if (act === 'photoEdit') return openPhotoEditor();
    if (act === 'prepClaude') return prepClaude();
    if (act === 'copyPrompt') { await navigator.clipboard.writeText(CLAUDE_PROMPT); return toast('Instruction copied'); }
    if (act === 'openClaude') return chrome.tabs.create({ url: 'https://claude.ai/new' });
    if (act === 'useReply') return useReply();
    if (act === 'confirm') { S.confirmed = true; S.step = 'labels'; save(); render(); window.scrollTo(0, 0); return ensureBuilt(); }
    if (act === 'build') return buildFiles();
    if (act === 'openPariksha') return chrome.tabs.create({ url: PARIKSHA });
    if (act === 'fill') return fillPage();
    if (act === 'attach') return attachFiles();
    if (act === 'routine') return routine(true);
    if (act === 'routineToggle') { settings.routineAuto = t.checked; return saveSettings(); }
  } catch (err) { console.error(err); M.busy = ''; render(); toast('Error: ' + err.message, 6000); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.c) {
    S.contact[t.dataset.c] = t.dataset.c === 'mobile' ? t.value.replace(/\D/g, '') : t.value.trim();
    if (S.details) { const k = t.dataset.c; S.details[k] = S.contact[k]; if (k === 'gender') S.details.title = t.value === 'Female' ? 'Ms' : 'Mr'; }
    save(); if (t.type === 'radio') render(); else refreshStepsOnly();
  }
  if (t.dataset.d) {
    const k = t.dataset.d, numeric = ['m10obt', 'm10max', 'm12obt', 'm12max', 'maths', 'phy', 'eng'].includes(k);
    let v = t.value;
    if (['firstName', 'middleName', 'lastName', 'mother', 'father'].includes(k)) v = v.toUpperCase();
    S.details[k] = numeric ? (v.trim() === '' ? null : Number(v.replace(/[^\d.]/g, ''))) : v;
    S.edited[k] = true; S.confirmed = false; save();
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.d) { render(); return; }               // re-run checks after an edit
  if (t.dataset.o) { S.options[t.dataset.o] = t.value; save(); return; }
  if (t.dataset.stage) { S.stage = t.dataset.stage; save(); return render(); }
  if (t.dataset.labSpace) { labelState(byKey(t.dataset.labSpace)).space = t.checked; labelsChanged(t.dataset.labSpace); return render(); }
  if (t.type === 'radio' && t.dataset.c) return;
  if (t.type !== 'file' || !t.files.length) return;
  const files = [...t.files]; t.value = '';
  try {
    if (t.hasAttribute('data-photo')) await addPhoto(files[0]);
    else if (t.dataset.bvc) await addBvc(t.dataset.bvc, files[0]);
    else if (t.dataset.doc) await addToDoc(t.dataset.doc, files, true);
    else if (t.hasAttribute('data-stack')) await addStack(files);
  } catch (err) { console.error(err); M.busy = ''; render(); toast('Could not read the file: ' + err.message, 6000); }
});
// drag & drop
document.addEventListener('dragover', e => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', async e => {
  const d = e.target.closest('[data-drop]'); if (!d) return;
  e.preventDefault(); d.classList.remove('over');
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  try {
    if (d.dataset.drop === 'photo') await addPhoto(files[0]);
    if (d.dataset.drop === 'stack') await addStack(files);
  } catch (err) { console.error(err); M.busy = ''; render(); toast('Could not read the file: ' + err.message, 6000); }
});

const byKey = k => DOCS.find(d => d.key === k);
function refreshStepsOnly() { const done = doneMap(); $$('#steps button').forEach(b => b.classList.toggle('done', !!done[b.dataset.step])); }
function invalidateFiles(keys) { (keys || ['sign', 'cert10', 'marks10', 'cert12', 'aadhaar']).forEach(k => delete S.files[k]); }

// ---------------------------------------------------------------- 1 start: photo + BVC

async function addPhoto(file) {
  busy('Finding the face…');
  const [c] = await IMG.fileToCanvases(file);
  M.photo = c; saveImages();
  const r = await IMG.autoPhotoCrop(c);
  await setPhotoCrop(r);
  M.busy = ''; render();
  if (!r.found) toast('No face found – adjust the crop by hand', 5000);
}
async function setPhotoCrop(r) {
  const blob = await IMG.photoOut(M.photo, r);
  S.photo = { rect: r, found: r.found, srcW: M.photo.width, url: await IMG.blobToDataURL(blob), kb: IMG.kb(blob.size) };
  S.files.photo = { url: S.photo.url, kb: S.photo.kb, type: 'image/jpeg' };
  save();
}
async function addBvc(k, file) {
  busy('Checking the BVC file…');
  const r = await IMG.fitExistingFile(file);
  S.bvc[k] = { name: file.name, pages: r.pages, changed: r.changed, kb: IMG.kb(r.blob.size) };
  S.files[k] = { url: await IMG.blobToDataURL(r.blob), kb: IMG.kb(r.blob.size), type: 'application/pdf' };
  M.busy = ''; save(); render();
}

// ---------------------------------------------------------------- 2 scan

async function processPages(key, canvases) {
  const out = [];
  for (const c of canvases) {
    let cur, warn = [];
    if (key === 'sign') cur = IMG.signatureProcess(c);
    else { const r = await IMG.autoProcess(c, { hasPhoto: HAS_PHOTO.includes(key) }); cur = r.canvas; warn = r.warn; }
    out.push({ orig: c, cur, warn, thumb: IMG.scaleTo(cur, 200).toDataURL('image/jpeg', 0.7) });
  }
  return out;
}
function storeMeta(key) {
  const p = M.pages[key] || [];
  S.docMeta[key] = { pages: p.length, thumbs: p.map(x => x.thumb) };
  saveImages();
}
async function addToDoc(key, files, replace) {
  busy('Reading and cleaning up pages…');
  const canvases = [];
  for (const f of files) canvases.push(...await IMG.fileToCanvases(f));
  const pages = await processPages(key, canvases);
  M.pages[key] = replace ? pages : [...(M.pages[key] || []), ...pages];
  storeMeta(key); invalidateFiles([key]);
  M.busy = ''; save(); render();
}
async function addStack(files) {
  busy('Splitting the scanned stack…');
  const canvases = [];
  for (const f of files) canvases.push(...await IMG.fileToCanvases(f));
  const empty = DOCS.filter(d => !(M.pages[d.key] && M.pages[d.key].length));
  let i = 0;
  for (const d of empty) {
    if (i >= canvases.length) break;
    M.busy = `Cleaning up page ${i + 1} of ${canvases.length} (${d.name})…`; render();
    M.pages[d.key] = await processPages(d.key, [canvases[i++]]);
    storeMeta(d.key); invalidateFiles([d.key]);
  }
  M.busy = ''; save(); render();
  if (i < canvases.length) toast(`${canvases.length - i} extra page(s) were not used – all boxes are full.`, 6000);
  else toast(`${i} page(s) placed. Check each box.`);
}

// page editor (rotate / crop / undo)
function openPageEditor(key, idx) {
  const page = M.pages[key][idx];
  let sel = null, drag = null;
  const cv = $('#ovCanvas');
  const draw = () => {
    cv.width = page.cur.width; cv.height = page.cur.height;
    const x = cv.getContext('2d'); x.drawImage(page.cur, 0, 0);
    if (sel) {
      const r = normR(sel); x.fillStyle = 'rgba(0,0,0,.4)';
      x.fillRect(0, 0, cv.width, r.y); x.fillRect(0, r.y + r.h, cv.width, cv.height - r.y - r.h);
      x.fillRect(0, r.y, r.x, r.h); x.fillRect(r.x + r.w, r.y, cv.width - r.x - r.w, r.h);
      x.strokeStyle = '#2f6bff'; x.lineWidth = Math.max(2, cv.width / 300); x.strokeRect(r.x, r.y, r.w, r.h);
    }
  };
  const normR = s => ({ x: Math.min(s.x0, s.x1), y: Math.min(s.y0, s.y1), w: Math.abs(s.x1 - s.x0), h: Math.abs(s.y1 - s.y0) });
  const pt = ev => { const b = cv.getBoundingClientRect(); return { x: (ev.clientX - b.left) * cv.width / b.width, y: (ev.clientY - b.top) * cv.height / b.height }; };
  const update = () => { page.thumb = IMG.scaleTo(page.cur, 200).toDataURL('image/jpeg', 0.7); storeMeta(key); invalidateFiles([key]); save(); };
  openOverlay(`${byKey(key).name} – page ${idx + 1}`, [
    ['⟲ Rotate', () => { page.cur = IMG.rotate90(page.cur, -1); sel = null; update(); draw(); }],
    ['⟳ Rotate', () => { page.cur = IMG.rotate90(page.cur, 1); sel = null; update(); draw(); }],
    ['✂ Apply crop', () => { if (!sel) return toast('Drag a box on the page first'); const r = normR(sel); if (r.w < 20 || r.h < 20) return; page.cur = IMG.crop(page.cur, r); sel = null; update(); draw(); }],
    ['Auto clean-up', async () => { const r = key === 'sign' ? { canvas: IMG.signatureProcess(page.orig), warn: [] } : await IMG.autoProcess(page.orig, { hasPhoto: HAS_PHOTO.includes(key) }); page.cur = r.canvas; page.warn = r.warn; sel = null; update(); draw(); }],
    ['Undo all (original scan)', () => { page.cur = IMG.cloneCanvas(page.orig); sel = null; update(); draw(); }],
  ], 'Drag on the page to select what to keep, then Apply crop.', () => render());
  cv.onpointerdown = ev => { const p = pt(ev); sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = true; cv.setPointerCapture(ev.pointerId); };
  cv.onpointermove = ev => { if (!drag) return; const p = pt(ev); sel.x1 = p.x; sel.y1 = p.y; draw(); };
  cv.onpointerup = () => { drag = false; };
  draw();
}

// photo editor (drag to move, slider to zoom)
function openPhotoEditor() {
  const c = M.photo; if (!c) return;
  const ar = IMG.PHOTO_W / IMG.PHOTO_H;
  let r = { ...S.photo.rect }, drag = null;
  const cv = $('#ovCanvas');
  const disp = IMG.scaleTo(c, 1200), k = disp.width / c.width;
  const draw = () => {
    cv.width = disp.width; cv.height = disp.height;
    const x = cv.getContext('2d'); x.drawImage(disp, 0, 0);
    x.fillStyle = 'rgba(0,0,0,.45)';
    const R = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    x.fillRect(0, 0, cv.width, R.y); x.fillRect(0, R.y + R.h, cv.width, cv.height - R.y - R.h);
    x.fillRect(0, R.y, R.x, R.h); x.fillRect(R.x + R.w, R.y, cv.width - R.x - R.w, R.h);
    x.strokeStyle = '#2f6bff'; x.lineWidth = 3; x.strokeRect(R.x, R.y, R.w, R.h);
    x.setLineDash([6, 6]); x.strokeStyle = 'rgba(255,255,255,.9)';      // 70% guide: head should span between these lines
    x.strokeRect(R.x + R.w * 0.15, R.y + R.h * 0.12, R.w * 0.7, R.h * 0.7); x.setLineDash([]);
  };
  const zoom = f => { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; const h = r.h * f; r = IMG.fitRect({ x: cx - h * ar / 2, y: cy - h / 2, w: h * ar, h }, c, ar); draw(); };
  openOverlay('Photo crop', [
    ['− Zoom out', () => zoom(1.06)], ['+ Zoom in', () => zoom(1 / 1.06)],
    ['Auto', async () => { r = await IMG.autoPhotoCrop(c); draw(); }],
  ], 'Drag the box to move it. Head (top of hair to chin) should roughly fill the dashed guide.', async () => {
    busy('Saving photo…'); await setPhotoCrop({ ...r, found: true }); M.busy = ''; render();
  });
  const pt = ev => { const b = cv.getBoundingClientRect(); return { x: (ev.clientX - b.left) * cv.width / b.width / k, y: (ev.clientY - b.top) * cv.height / b.height / k }; };
  cv.onpointerdown = ev => { drag = { p: pt(ev), r: { ...r } }; cv.setPointerCapture(ev.pointerId); };
  cv.onpointermove = ev => { if (!drag) return; const p = pt(ev); r = IMG.fitRect({ ...drag.r, x: drag.r.x + p.x - drag.p.x, y: drag.r.y + p.y - drag.p.y }, c, ar); draw(); };
  cv.onpointerup = () => { drag = null; };
  cv.onwheel = ev => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.04 : 1 / 1.04); };
  draw();
}

function openOverlay(title, tools, hint, onClose) {
  $('#ovTitle').textContent = title; $('#ovHint').textContent = hint;
  const box = $('#ovTools'); box.innerHTML = '';
  for (const [label, fn] of tools) { const b = document.createElement('button'); b.className = 'small'; b.textContent = label; b.onclick = fn; box.appendChild(b); }
  $('#overlay').classList.remove('hidden');
  $('#ovClose').onclick = () => { $('#overlay').classList.add('hidden'); const cv = $('#ovCanvas'); cv.onpointerdown = cv.onpointermove = cv.onpointerup = cv.onwheel = null; onClose && onClose(); };
}

// ---------------------------------------------------------------- 3 read

async function prepClaude() {
  busy('Preparing the PDF for Claude…');
  const pages = ['cert10', 'marks10', 'cert12', 'aadhaar'].flatMap(k => M.pages[k].map(p => p.cur));
  const doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
  pages.forEach((c, i) => {
    const s = IMG.scaleTo(c, 1800), W = 595, H = Math.round(595 * s.height / s.width);
    if (i === 0) doc.deletePage(1);
    doc.addPage([W, H], W > H ? 'l' : 'p'); doc.addImage(s.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, W, H);
  });
  const url = URL.createObjectURL(doc.output('blob'));
  await removeClaudeDownload();
  S.claudeDl = await chrome.downloads.download({ url, filename: `CN-Desk-for-Claude-${Date.now()}.pdf`, conflictAction: 'uniquify', saveAs: false });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  let copied = true;
  try { await navigator.clipboard.writeText(CLAUDE_PROMPT); } catch (e) { copied = false; }
  M.busy = ''; save(); render();
  toast(copied ? 'PDF saved to Downloads and instruction copied. Open Claude, paste, attach the PDF.'
    : 'PDF saved to Downloads. Press "Copy instruction again" to copy the instruction.', 6000);
}
async function removeClaudeDownload() {
  if (S.claudeDl == null) return;
  try { await chrome.downloads.removeFile(S.claudeDl); } catch (e) { /* already gone */ }
  try { await chrome.downloads.erase({ id: S.claudeDl }); } catch (e) { /* ignore */ }
  S.claudeDl = null;
}
async function useReply() {
  const text = $('#reply').value;
  try {
    S.reply = parseClaudeReply(text);
    S.details = buildDetails(S.reply, S.contact);
    S.edited = {}; S.dismissed = []; S.confirmed = false;
    await removeClaudeDownload();
    S.step = 'review'; save(); render(); window.scrollTo(0, 0);
  } catch (e) { $('#replyErr').textContent = e.message; }
}

// ---------------------------------------------------------------- 5 labels + files

async function labelImg(name) {
  if (!M.labelImgs[name]) M.labelImgs[name] = await IMG.loadImageURL(`labels/${name}.png`);
  return M.labelImgs[name];
}
async function drawAllLabelCanvases() {
  for (const cv of $$('canvas[data-labcanvas]')) {
    const d = byKey(cv.dataset.labcanvas), page = M.pages[d.key][0].cur, img = await labelImg(d.label), l = labelState(d);
    if (l.space == null) { l.space = l.on && IMG.inkUnder(page, img, l); save(); if (l.space) { render(); return; } }
    setupLabelCanvas(cv, d, page, img);
  }
}
function setupLabelCanvas(cv, d, page, img) {
  const base = IMG.scaleTo(page, 800), l = labelState(d), W = base.width, H = base.height;
  let mode = null, start = null;
  const geom = () => {
    const dm = IMG.labelDims(W, img, l);
    const strip = l.space ? Math.round(dm.bh + W * 0.03) : 0;
    return { ...dm, strip, x: l.x * W, y: l.space ? W * 0.015 : l.y * H + strip };
  };
  const hs = Math.max(14, W * 0.03);
  const draw = () => {
    const g = geom();
    cv.width = W; cv.height = H + g.strip;
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(base, 0, g.strip);
    if (!l.on) return;
    IMG.drawLabel(x, img, g.x, g.y, g, l.rot);
    x.strokeStyle = 'rgba(31,79,209,.8)'; x.setLineDash([5, 4]); x.lineWidth = 2; x.strokeRect(g.x, g.y, g.bw, g.bh); x.setLineDash([]);
    x.fillStyle = '#1f4fd1'; x.beginPath(); x.moveTo(g.x + g.bw, g.y + g.bh - hs); x.lineTo(g.x + g.bw, g.y + g.bh); x.lineTo(g.x + g.bw - hs, g.y + g.bh); x.fill();
    x.fillStyle = '#b42318'; x.fillRect(g.x + g.bw - hs, g.y, hs, hs); x.fillStyle = '#fff'; x.font = `bold ${hs * 0.8}px sans-serif`; x.fillText('✕', g.x + g.bw - hs * 0.85, g.y + hs * 0.8);
  };
  const pt = ev => { const b = cv.getBoundingClientRect(); return { x: (ev.clientX - b.left) * cv.width / b.width, y: (ev.clientY - b.top) * cv.height / b.height }; };
  cv.onpointerdown = ev => {
    if (!l.on) return;
    const p = pt(ev), g = geom();
    if (p.x > g.x + g.bw - hs && p.x < g.x + g.bw && p.y > g.y && p.y < g.y + hs) { l.on = false; labelsChanged(d.key); return render(); }
    if (p.x > g.x + g.bw - hs * 1.5 && p.x < g.x + g.bw + 4 && p.y > g.y + g.bh - hs * 1.5 && p.y < g.y + g.bh + 4) mode = 'size';
    else if (p.x >= g.x && p.x <= g.x + g.bw && p.y >= g.y && p.y <= g.y + g.bh) mode = 'move';
    else return;
    start = { p, l: { ...l } }; cv.setPointerCapture(ev.pointerId);
  };
  cv.onpointermove = ev => {
    if (!mode) return;
    const p = pt(ev), dx = (p.x - start.p.x) / W, dy = (p.y - start.p.y) / H, g = geom();
    if (mode === 'move') { l.x = clamp(start.l.x + dx, 0, Math.max(0, 1 - g.bw / W)); if (!l.space) l.y = clamp(start.l.y + dy, 0, Math.max(0, 1 - g.bh / H)); }
    else {
      const side = ((l.rot || 0) % 180) !== 0;
      l.w = clamp(start.l.w + (side ? (p.y - start.p.y) / W : dx), 0.08, 1.2);
    }
    draw();
  };
  cv.onpointerup = () => {
    if (!mode) return; mode = null;
    settings.labelPos[d.key] = { x: l.x, y: l.y, w: l.w, rot: l.rot || 0 }; saveSettings();
    labelsChanged(d.key); refreshStepsOnly();
  };
  draw();
}
// a label was moved/turned/removed: rebuild that file shortly after
let rebuildT = 0;
function labelsChanged(key) {
  invalidateFiles([key]); save();
  clearTimeout(rebuildT);
  rebuildT = setTimeout(() => { if (S.step === 'labels') buildFiles({ quiet: true }); }, 1200);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

async function buildFiles({ quiet = false } = {}) {
  if (!canBuildFiles()) return;
  busy('Building files…');
  // signature
  const sigBlob = await IMG.jpegUnder(IMG.scaleTo(M.pages.sign[0].cur, 900), IMG.LIMITS.sign);
  S.files.sign = { url: await IMG.blobToDataURL(sigBlob), kb: IMG.kb(sigBlob.size), type: 'image/jpeg' };
  for (const d of LABELLED) {
    M.busy = `Building ${d.name}…`; render();
    const pages = M.pages[d.key].map(p => p.cur), l = labelState(d), img = await labelImg(d.label);
    pages[0] = IMG.composeLabel(pages[0], img, l, l.on, l.space);
    const blob = await IMG.pdfUnder(pages);
    S.files[d.key] = { url: await IMG.blobToDataURL(blob), kb: IMG.kb(blob.size), type: 'application/pdf' };
  }
  M.busy = ''; save(); render();
  const over = Object.entries(S.files).filter(([k, f]) => f.kb * 1024 > limitFor(k));
  if (quiet && !over.length) return;
  toast(over.length ? `Some files are over the limit: ${over.map(o => o[0]).join(', ')}` : 'All files built and under the limits ✓', 5000);
}

// ---------------------------------------------------------------- 6 Pariksha

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.startsWith(PARIKSHA)) return tab;
  // panel opened in its own window/tab: use the most recently used visible Pariksha tab
  const others = await chrome.tabs.query({ active: true, url: PARIKSHA + '*' });
  return others.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
}
async function ping(tab) {
  try { return await chrome.tabs.sendMessage(tab.id, { cmd: 'ping' }); }
  catch (e) {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); return await chrome.tabs.sendMessage(tab.id, { cmd: 'ping' }); }
    catch (e2) { return null; }
  }
}
async function refreshTab() {
  const tab = await activeTab();
  M.tabId = tab ? tab.id : null;
  const r = tab ? await ping(tab) : null;
  const k = r ? r.kind : null;
  if (k !== M.pageKind) { M.pageKind = k; if (S.step === 'pariksha') render(); }
}
async function send(msg) {
  const tab = await activeTab();
  if (!tab) throw new Error('Switch to the Pariksha tab first.');
  await ping(tab);
  return chrome.tabs.sendMessage(tab.id, msg);
}
const fillData = () => ({ ...S.details, ...derived(S.details), mobile: S.details.mobile || S.contact.mobile, email: S.details.email || S.contact.email });

async function fillPage() {
  const k = M.pageKind;
  if (k !== 'login' && !S.confirmed) return toast('Confirm the details in step 4 first.', 4000);
  if (S.pariksha[k] && !confirm('Fill this page again? Anything you changed by hand on these fields will be overwritten.')) return;
  busy('Filling the page…');
  const rep = await send({ cmd: 'fill', data: fillData(), options: S.options });
  M.busy = '';
  S.lastReport = { ...rep, kind: k };
  if (!rep.error) { S.pariksha[k] = true; if (k === 'register' || k === 'login') S.stage = 'login'; }
  save(); render();
}
async function attachFiles() {
  if (!S.confirmed) return toast('Confirm the details in step 4 first.', 4000);
  if (S.pariksha.documents && !confirm('Attach all files again?')) return;
  await ensureBuilt();
  if (!allBuilt()) return toast('Some files are missing – check steps 1, 2 and 5.', 5000);
  busy('Attaching files…');
  const files = SLOTS.map(s => {
    const f = S.files[s.file], ext = f.type === 'application/pdf' ? 'pdf' : 'jpg';
    const b64 = f.url.split(',')[1];
    return { row: s.row, title: s.title, name: `${String(s.row).padStart(2, '0')}_${s.title.replace(/\W+/g, '_')}.${ext}`, type: f.type, b64, size: Math.round(b64.length * 3 / 4), docNumber: s.docNumber };
  });
  const rep = await send({ cmd: 'attach', files });
  M.busy = '';
  S.lastReport = { ...rep, kind: 'documents' };
  if (!rep.error && !rep.failed.length) S.pariksha.documents = true;
  save(); render();
}
async function routine(manual) {
  const rep = await send({ cmd: 'routine', stage: S.stage });
  if (manual && rep && !rep.done) toast('Could not do it: ' + (rep.why || rep.error || 'unknown') + ' – click it yourself.', 5000);
}

// messages from Pariksha pages
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab || !sender.tab.url || !sender.tab.url.startsWith(PARIKSHA)) return;
  if (msg.evt === 'session') { const b = $('#banner'); b.textContent = 'Pariksha will log you out in 2 minutes – click "Keep me login" on the page.'; b.classList.remove('hidden'); setTimeout(() => b.classList.add('hidden'), 20000); }
  if (msg.evt === 'page') {
    activeTab().then(async tab => {
      if (!tab || tab.id !== sender.tab.id) return;
      M.pageKind = msg.kind; M.tabId = tab.id;
      if (S.step === 'pariksha') render();
      const active = S.confirmed && !!S.details;
      if (!active || !settings.routineAuto) return;
      if (ROUTINE.includes(msg.kind)) { await sleep(700); chrome.tabs.sendMessage(tab.id, { cmd: 'routine', stage: S.stage }).catch(() => {}); }
      if (msg.kind === 'login' && !S.pariksha.login) { await sleep(500); S.step = 'pariksha'; await fillPage(); }
    });
  }
});
chrome.tabs.onActivated.addListener(() => refreshTab());
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') refreshTab(); });

// ---------------------------------------------------------------- done

$('#btnDone').addEventListener('click', async () => {
  if (!confirm('Finished with this student? Everything about them will be wiped from this PC.')) return;
  await removeClaudeDownload();
  try { await navigator.clipboard.writeText(''); } catch (e) { /* ignore */ }
  S = fresh(); M.photo = null; M.pages = {}; M.busy = '';
  clearTimeout(imgT); clearTimeout(saveT);
  await chrome.storage.session.remove(['cn', 'cnImg']).catch(() => {});
  render(); window.scrollTo(0, 0);
  toast('Wiped. Ready for the next student.');
});

// ---------------------------------------------------------------- boot

await load();
render();
if (S.step === 'labels') ensureBuilt();
refreshTab();
