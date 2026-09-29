/* CN Desk — runs entirely in the browser, no server. Data lives in localStorage. */
'use strict';

// ---------------------------------------------------------------- defaults

const DEFAULT_SLOTS = [
  // no, name, label, fmt, minKB, maxKB, w, h, exact, pages (in scan stack), source (reuse slot no), stamp
  [1,  'Photograph',                 '',                              'jpg', 10, 50,  600,  800,  false, 1, 0,  false],
  [2,  'Signature',                  '',                              'jpg', 5,  30,  600,  250,  false, 1, 0,  false],
  [3,  'UID (Aadhaar)',              'SL No 3 : UID',                 'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [4,  '10th Marksheet',             'SL No 4 : 10th Marksheet',      'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [5,  '10th Pass Certificate',      'SL No 5 : 10th Pass Certificate','jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [6,  '12th Marksheet',             'SL No 6 : 12th Marksheet',      'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [7,  '12th Pass Certificate',      'SL No 7 : 12th Pass Certificate','jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [8,  'BVC - 10th',                 'SL No 8 : BVC 10th',            'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [9,  'BVC - 12th',                 'SL No 9 : BVC 12th',            'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [10, 'Date of Birth proof',        'SL No 10 : DOB Proof',          'jpg', 10, 200, 1800, 1800, false, 1, 4,  true],
  [11, 'Address proof',              'SL No 11 : Address Proof',      'jpg', 10, 200, 1800, 1800, false, 1, 3,  true],
  [12, 'Nationality proof',          'SL No 12 : Nationality Proof',  'jpg', 10, 200, 1800, 1800, false, 1, 3,  true],
  [13, 'Other document',             'SL No 13 : Other',              'jpg', 10, 200, 1800, 1800, false, 1, 0,  true],
  [14, 'Identity proof',             'SL No 14 : Identity Proof',     'jpg', 10, 200, 1800, 1800, false, 1, 3,  true],
].map(([no, name, label, fmt, minKB, maxKB, w, h, exact, pages, source, stamp]) =>
  ({ no, name, label, fmt, minKB, maxKB, w, h, exact, pages, source, stamp, stampImg: '' }));

const VERIFY = '(VERIFY CURRENT ADDRESS BEFORE POSTING)';
const DEFAULT_BOARDS = {
  KERALA: { name: 'Kerala State', exam10: 'SSLC', exam12: 'Higher Secondary (Plus Two)', fee10: '', fee12: '',
    addr10: 'The Commissioner for Government Examinations\nPareeksha Bhavan, Poojappura\nThiruvananthapuram - 695 012\nKerala',
    addr12: 'The Secretary\nBoard of Higher Secondary Examinations\nHousing Board Buildings, Santhi Nagar\nThiruvananthapuram - 695 001\nKerala' },
  CBSE: { name: 'CBSE', exam10: 'Secondary School Examination (Class X)', exam12: 'Senior School Certificate Examination (Class XII)', fee10: '', fee12: '',
    addr10: 'The Regional Officer\nCentral Board of Secondary Education\nRegional Office, Thiruvananthapuram\n' + VERIFY,
    addr12: 'The Regional Officer\nCentral Board of Secondary Education\nRegional Office, Thiruvananthapuram\n' + VERIFY },
  CISCE: { name: 'CISCE (ICSE / ISC)', exam10: 'ICSE (Class X)', exam12: 'ISC (Class XII)', fee10: '', fee12: '',
    addr10: 'The Chief Executive & Secretary\nCouncil for the Indian School Certificate Examinations\nPragati House, 3rd Floor, 47-48 Nehru Place\nNew Delhi - 110 019',
    addr12: 'The Chief Executive & Secretary\nCouncil for the Indian School Certificate Examinations\nPragati House, 3rd Floor, 47-48 Nehru Place\nNew Delhi - 110 019' },
  OTHER: { name: 'Other board', exam10: 'Class X', exam12: 'Class XII', fee10: '', fee12: '', addr10: '', addr12: '' },
};

const DEFAULT_TPL_REQUEST =
`{{company}}
{{companyAddress}}
Ph: {{companyPhone}}   Email: {{companyEmail}}

Date: {{today}}

To,
{{boardAddress}}

Sub: Request for Board Verification Certificate (BVC) - {{exam}} - {{name}}, Reg. No. {{regNo}} ({{month}} {{year}})

Respected Sir/Madam,

{{name}}, {{relation}} {{fatherName}}, date of birth {{dob}}, passed the {{exam}} examination conducted by your Board in {{month}} {{year}} under Register / Roll No. {{regNo}}, from {{school}}.

The candidate is applying to the Directorate General of Civil Aviation (DGCA), Government of India, for allotment of a Computer Number. DGCA requires a Board Verification Certificate confirming the genuineness of the candidate's marksheet / certificate.

We therefore request you to kindly verify the enclosed copy of the marksheet and issue the Board Verification Certificate at the earliest. The prescribed fee, {{fee}}, is enclosed.

Enclosures:
1. Self-attested copy of the {{exam}} marksheet
2. Authorisation letter from the candidate
3. Self-attested copy of Aadhaar
4. Fee: {{fee}}
5. Self-addressed stamped envelope

Thanking you,
Yours faithfully,



{{signatory}}
{{designation}}, {{company}}`;

const DEFAULT_TPL_CONSENT =
`From,
{{name}}
{{studentAddress}}
Ph: {{phone}}

Date: {{today}}

To,
{{boardAddress}}

Sub: Authorisation for issue of Board Verification Certificate - {{exam}}, Reg. No. {{regNo}} ({{month}} {{year}})

Respected Sir/Madam,

I, {{name}}, {{relation}} {{fatherName}}, born on {{dob}}, passed the {{exam}} examination under Register / Roll No. {{regNo}} in {{month}} {{year}}.

I hereby authorise {{company}} to apply on my behalf for the Board Verification Certificate of the above examination, which is required for my application for a Computer Number with the Directorate General of Civil Aviation (DGCA). I consent to the Board sharing the verification result with {{company}} and DGCA for this purpose.

Aadhaar No.: {{aadhaarMasked}}



Signature of candidate
({{name}})`;

// Student form definition: [key, label, type, options]
const STUDENT_FIELDS = [
  ['#', 'Personal (exactly as on the marksheet)'],
  ['name', 'Full name', 'text'], ['dob', 'Date of birth', 'date'],
  ['gender', 'Gender', 'select', ['', 'Male', 'Female', 'Other']],
  ['fatherName', "Father's name", 'text'], ['motherName', "Mother's name", 'text'],
  ['nationality', 'Nationality', 'text'], ['aadhaar', 'Aadhaar number', 'text'],
  ['phone', 'Mobile', 'text'], ['email', 'Email', 'text'],
  ['#', 'Address (exactly as on Aadhaar)'],
  ['addrCareOf', 'C/O', 'text'], ['addrHouse', 'House / building', 'text'], ['addrStreet', 'Street / road', 'text'],
  ['addrLandmark', 'Landmark', 'text'], ['addrLocality', 'Locality / area', 'text'], ['addrVTC', 'Village / town / city', 'text'],
  ['addrPO', 'Post office', 'text'], ['addrSubDistrict', 'Sub-district / taluk', 'text'], ['addrDistrict', 'District', 'text'],
  ['addrState', 'State', 'text'], ['addrPin', 'PIN code', 'text'],
  ['#', '10th'],
  ['board10', 'Board', 'board'], ['regNo10', 'Register / roll no.', 'text'], ['month10', 'Exam month', 'text'],
  ['year10', 'Exam year', 'text'], ['school10', 'School', 'text'],
  ['#', '12th'],
  ['board12', 'Board', 'board'], ['regNo12', 'Register / roll no.', 'text'], ['month12', 'Exam month', 'text'],
  ['year12', 'Exam year', 'text'], ['school12', 'School', 'text'],
  ['#', 'Application tracking'],
  ['bvc10Posted', 'BVC 10th - letter posted on', 'date'], ['bvc10Tracking', 'BVC 10th - speed post no.', 'text'],
  ['bvc10Received', 'BVC 10th - received on', 'date'],
  ['bvc12Posted', 'BVC 12th - letter posted on', 'date'], ['bvc12Tracking', 'BVC 12th - speed post no.', 'text'],
  ['bvc12Received', 'BVC 12th - received on', 'date'],
  ['portalLogin', 'Pariksha login ID', 'text'], ['cnApplied', 'Applied on Pariksha on', 'date'], ['appNo', 'Application no.', 'text'],
  ['result', 'DGCA status', 'select', ['', 'Pending', 'Rejected', 'Approved']],
  ['rejectReason', 'Rejection reason', 'text'], ['cnNumber', 'Computer Number', 'text'],
  ['notes', 'Notes', 'textarea'],
];
const PCM = [['phy', 'Physics'], ['chem', 'Chemistry'], ['math', 'Mathematics']];
const LATE_DAYS = 30;

// ---------------------------------------------------------------- storage

const KEY = 'cndesk.v1';
let db = load();

function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
  d = d || {};
  d.students = d.students || [];
  d.settings = d.settings || {};
  const s = d.settings;
  s.company = Object.assign({ name: 'AEROWIS', address: '', phone: '', email: '', signatory: '', designation: '' }, s.company);
  s.boards = Object.assign(structuredClone(DEFAULT_BOARDS), s.boards);
  s.slots = s.slots && s.slots.length ? s.slots : structuredClone(DEFAULT_SLOTS);
  s.tplRequest = s.tplRequest || DEFAULT_TPL_REQUEST;
  s.tplConsent = s.tplConsent || DEFAULT_TPL_CONSENT;
  s.stampMode = s.stampMode || 'band';
  s.stampColor = s.stampColor || '#1a2a8a';
  return d;
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Could not save: ' + e.message + ' (browser storage full? remove handwriting images)'); }
  }, 250);
}

// ---------------------------------------------------------------- helpers

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 864e5) : 0;
const todayIso = () => new Date().toISOString().slice(0, 10);
const safeName = s => String(s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'file';
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('Copied: ' + (text.length > 40 ? text.slice(0, 40) + '…' : text), 1500);
}

function pcmResult(st) {
  let o = 0, m = 0;
  for (const [k] of PCM) {
    const ob = parseFloat(st[k + 'Obt']), mx = parseFloat(st[k + 'Max']);
    if (!(mx > 0) || isNaN(ob)) return null;
    o += ob; m += mx;
  }
  return { obt: o, max: m, pct: o / m * 100 };
}
function relation(st) { return st.gender === 'Female' ? 'D/o' : st.gender === 'Male' ? 'S/o' : 'S/o / D/o'; }
function addressLines(st) {
  return [st.addrCareOf && 'C/O ' + st.addrCareOf, st.addrHouse, st.addrStreet, st.addrLandmark, st.addrLocality,
    st.addrVTC, st.addrPO && st.addrPO + ' P.O.', st.addrSubDistrict, st.addrDistrict,
    [st.addrState, st.addrPin].filter(Boolean).join(' - ')].filter(Boolean);
}
function maskAadhaar(a) { const d = String(a || '').replace(/\D/g, ''); return d.length === 12 ? 'XXXX XXXX ' + d.slice(8) : a || ''; }

// Where a student is in the pipeline, and what to do next.
function stage(st) {
  if (st.cnNumber || st.result === 'Approved') return { text: 'CN received', cls: 'done' };
  if (st.result === 'Rejected') return { text: 'Rejected - fix & resubmit', cls: 'late' };
  if (st.cnApplied) return { text: `Applied, waiting DGCA (${daysSince(st.cnApplied)}d)`, cls: '' };
  const todo = [];
  for (const lv of ['10', '12']) {
    if (!st['board' + lv]) { todo.push({ text: `Set ${lv}th board`, cls: '' }); continue; }
    if (!st[`bvc${lv}Posted`]) todo.push({ text: `Post BVC letter ${lv}th`, cls: '' });
    else if (!st[`bvc${lv}Received`]) {
      const d = daysSince(st[`bvc${lv}Posted`]);
      todo.push({ text: `Waiting BVC ${lv}th (${d}d)`, cls: d > LATE_DAYS ? 'late' : '' });
    }
  }
  return todo.length ? todo : { text: 'Ready to apply on Pariksha', cls: 'done' };
}
const stageBadges = st => [].concat(stage(st)).map(s => `<span class="badge ${s.cls}">${esc(s.text)}</span>`).join('');

// ---------------------------------------------------------------- tabs

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'letters' || b.dataset.tab === 'docs') fillStudentSelects();
  if (b.dataset.tab === 'docs') renderSlots();
});

function fillStudentSelects() {
  for (const sel of [$('#letterStudent'), $('#docStudent')]) {
    const cur = sel.value || currentId;
    sel.innerHTML = '<option value="">— choose —</option>' + db.students.map(s => `<option value="${s.id}">${esc(s.name || '(unnamed)')}</option>`).join('');
    if (db.students.some(s => s.id === cur)) sel.value = cur;
  }
}

// ---------------------------------------------------------------- students

let currentId = null;
let editorMode = 'edit';

function renderStudentList() {
  const q = $('#studentSearch').value.toLowerCase();
  const rows = db.students
    .map(s => ({ s, st: [].concat(stage(s)) }))
    .filter(({ s, st }) => !q || [s.name, s.phone, s.appNo, s.cnNumber, ...st.map(x => x.text)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.st.some(x => x.cls === 'late') - a.st.some(x => x.cls === 'late')) || (a.s.name || '').localeCompare(b.s.name || ''));
  $('#studentList').innerHTML = rows.length ? rows.map(({ s }) =>
    `<div class="stu ${s.id === currentId ? 'sel' : ''}" data-id="${s.id}"><div class="nm">${esc(s.name || '(unnamed)')}</div>${stageBadges(s)}</div>`
  ).join('') : '<p class="muted">No students yet.</p>';
}
$('#studentSearch').addEventListener('input', renderStudentList);
$('#studentList').addEventListener('click', e => {
  const d = e.target.closest('.stu'); if (!d) return;
  currentId = d.dataset.id; renderStudentList(); renderEditor();
});
$('#newStudent').addEventListener('click', () => {
  const s = { id: uid(), nationality: 'Indian', addrState: 'Kerala', created: todayIso() };
  PCM.forEach(([k]) => s[k + 'Max'] = '');
  db.students.push(s); save();
  currentId = s.id; editorMode = 'edit'; renderStudentList(); renderEditor();
  $('#studentEditor input')?.focus();
});

function boardOptions(val) {
  return '<option value=""></option>' + Object.entries(db.settings.boards)
    .map(([k, b]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
}

function renderEditor() {
  const st = db.students.find(s => s.id === currentId);
  const box = $('#studentEditor');
  if (!st) { box.innerHTML = '<p class="muted">Select a student or click <b>+ New</b>.</p>'; return; }
  const head = `<div class="row wrap"><h2 style="margin:0">${esc(st.name || 'New student')}</h2>${stageBadges(st)}<span class="spacer"></span>
    <button data-mode="edit" class="${editorMode === 'edit' ? 'primary' : ''}">Edit details</button>
    <button data-mode="copy" class="${editorMode === 'copy' ? 'primary' : ''}">Copy to Pariksha</button>
    <button data-act="letters">BVC letters</button><button data-act="docs">Documents</button>
    <button data-act="delete" class="danger">Delete</button></div>`;
  box.innerHTML = head + (editorMode === 'edit' ? editForm(st) : copyPanel(st));
}

function editForm(st) {
  let html = '', open = false;
  for (const [k, label, type, opts] of STUDENT_FIELDS) {
    if (k === '#') {
      if (open) html += '</div>';
      if (label === 'Application tracking') html += pcmTable(st);
      html += `<div class="section-title">${esc(label)}</div><div class="grid2">`; open = true;
      continue;
    }
    const v = st[k] ?? '';
    let input;
    if (type === 'select') input = `<select data-k="${k}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (type === 'board') input = `<select data-k="${k}">${boardOptions(v)}</select>`;
    else if (type === 'textarea') input = `<textarea data-k="${k}" rows="3">${esc(v)}</textarea>`;
    else input = `<input data-k="${k}" type="${type}" value="${esc(v)}">`;
    html += `<label>${esc(label)}${input}</label>`;
  }
  return html + '</div>';
}

function pcmTable(st) {
  const r = pcmResult(st);
  return `<div class="section-title">12th PCM marks</div>
    <table class="pcm"><tr><th></th><th>Obtained</th><th>Out of</th></tr>
    ${PCM.map(([k, n]) => `<tr><td>${n}</td><td><input data-k="${k}Obt" type="number" step="any" value="${esc(st[k + 'Obt'] ?? '')}"></td>
      <td><input data-k="${k}Max" type="number" step="any" value="${esc(st[k + 'Max'] ?? '')}"></td></tr>`).join('')}
    <tr><td><b>PCM %</b></td><td colspan="2" id="pcmOut">${r ? `<b>${r.pct.toFixed(2)} %</b> <span class="muted">(${r.obt} / ${r.max}, exact ${r.pct.toFixed(4)})</span>` : '<span class="muted">enter all marks</span>'}</td></tr></table>
    <p class="muted">For Kerala HSE, enter the total for each subject (theory + CE + practical) from the marksheet and its maximum.</p>`;
}

function copyPanel(st) {
  const r = pcmResult(st);
  const rows = [];
  for (const [k, label, type] of STUDENT_FIELDS) {
    if (k === '#') {
      if (label === 'Application tracking') { rows.push('<div class="section-title">12th PCM</div>'); pcmRows(); }
      rows.push(`<div class="section-title">${esc(label)}</div>`); continue;
    }
    if (k.startsWith('bvc') || ['result', 'rejectReason', 'notes', 'cnApplied', 'appNo', 'cnNumber'].includes(k)) continue;
    let v = st[k] ?? '';
    if (type === 'date') v = fmtDate(v);
    if (type === 'board') v = db.settings.boards[v]?.name || '';
    rows.push(row(label, v));
  }
  function pcmRows() {
    PCM.forEach(([k, n]) => rows.push(row(n + ' (obtained / max)', st[k + 'Obt'] != null ? `${st[k + 'Obt']} / ${st[k + 'Max']}` : '')));
    rows.push(row('PCM %', r ? r.pct.toFixed(2) : ''));
  }
  function row(label, v) {
    return `<div class="copyrow"><span class="muted">${esc(label)}</span><span class="v">${esc(v)}</span>
      ${v ? `<button class="small" data-copy="${esc(v)}">Copy</button>` : '<span></span>'}</div>`;
  }
  return `<p class="muted">Open Pariksha in another window, then click <b>Copy</b> and paste (Ctrl+V) field by field.
    <label><input type="checkbox" id="copyUpper" ${copyUpper ? 'checked' : ''}> Copy in CAPITALS</label></p>` + rows.join('');
}
let copyUpper = false;

$('#studentEditor').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  const st = db.students.find(s => s.id === currentId); if (!st) return;
  st[k] = e.target.value; save();
  if (/^(phy|chem|math)/.test(k)) {
    const r = pcmResult(st);
    $('#pcmOut').innerHTML = r ? `<b>${r.pct.toFixed(2)} %</b> <span class="muted">(${r.obt} / ${r.max}, exact ${r.pct.toFixed(4)})</span>` : '<span class="muted">enter all marks</span>';
  }
  if (k === 'name' || /bvc|result|cn|board/.test(k)) renderStudentList();
});
$('#studentEditor').addEventListener('change', e => { if (e.target.id === 'copyUpper') copyUpper = e.target.checked; });
$('#studentEditor').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.copy != null) return copyText(copyUpper ? b.dataset.copy.toUpperCase() : b.dataset.copy);
  if (b.dataset.mode) { editorMode = b.dataset.mode; return renderEditor(); }
  const act = b.dataset.act;
  if (act === 'delete') {
    const st = db.students.find(s => s.id === currentId);
    if (!confirm(`Delete ${st.name || 'this student'}? This cannot be undone (unless you have a backup).`)) return;
    db.students = db.students.filter(s => s.id !== currentId); currentId = null; save(); renderStudentList(); renderEditor();
  }
  if (act === 'letters' || act === 'docs') {
    $(`#tabs button[data-tab="${act}"]`).click();
    $(act === 'letters' ? '#letterStudent' : '#docStudent').value = currentId;
  }
});

// ---------------------------------------------------------------- letters

function fillTemplate(tpl, vars) { return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m); }

function letterVars(st, lv) {
  const c = db.settings.company, b = db.settings.boards[st['board' + lv]] || {};
  return {
    today: fmtDate(todayIso()), company: c.name, companyAddress: c.address, companyPhone: c.phone, companyEmail: c.email,
    signatory: c.signatory, designation: c.designation,
    boardAddress: b['addr' + lv] || '[board address - set in Settings]', exam: b['exam' + lv] || '', level: lv + 'th',
    fee: b['fee' + lv] || '[fee / DD details]',
    name: st.name || '', relation: relation(st), fatherName: st.fatherName || '', motherName: st.motherName || '',
    dob: fmtDate(st.dob), regNo: st['regNo' + lv] || '', month: st['month' + lv] || '', year: st['year' + lv] || '',
    school: st['school' + lv] || '', studentAddress: addressLines(st).join('\n'), phone: st.phone || '',
    aadhaar: st.aadhaar || '', aadhaarMasked: maskAadhaar(st.aadhaar),
  };
}

$('#letterBuild').addEventListener('click', buildLetters);
function buildLetters() {
  const st = db.students.find(s => s.id === $('#letterStudent').value);
  if (!st) return toast('Choose a student first');
  const lv = $('#letterLevel').value;
  if (!st['board' + lv]) return toast(`Set the ${lv}th board for this student first`);
  const v = letterVars(st, lv);
  const missing = ['name', 'regNo', 'year', 'dob', 'fatherName'].filter(k => !v[k]);
  const pages = [fillTemplate(db.settings.tplRequest, v), fillTemplate(db.settings.tplConsent, v)];
  const label = `<div class="label-box"><b>To,</b>\n${esc(v.boardAddress)}</div>\n\n<div class="label-box"><b>From,</b>\n${esc(v.company)}\n${esc(v.companyAddress)}\nPh: ${esc(v.companyPhone)}</div>\n\n<div class="label-box"><b>Return envelope - To,</b>\n${esc(v.company)}\n${esc(v.companyAddress)}</div>`;
  $('#letterPreview').innerHTML =
    (missing.length ? `<p class="warn">Missing: ${missing.join(', ')} — fill these in the student's details.</p>` : '') +
    pages.map(p => `<div class="paper">${esc(p)}</div>`).join('') + `<div class="paper label">${label}</div>`;
}
$('#letterPrint').addEventListener('click', () => {
  if (!$('#letterPreview .paper')) buildLetters();
  printPapers($$('#letterPreview .paper').map(p => p.outerHTML).join(''));
});
function printPapers(html) {
  $('#printArea').innerHTML = html;
  window.print();
}

// ---------------------------------------------------------------- documents

const docState = { pages: [], results: {} };
const slotByNo = no => db.settings.slots.find(s => s.no === +no);
const labelFor = s => s.label || `SL No ${s.no} : ${s.name}`;

function specText(s) {
  const dims = s.w || s.h ? (s.exact ? `exactly ${s.w}×${s.h}px` : `max ${s.w || '∞'}×${s.h || '∞'}px`) : '';
  return [s.fmt.toUpperCase(), `${s.minKB || 0}-${s.maxKB || '∞'} KB`, dims].filter(Boolean).join(' · ');
}

$('#docFiles').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    try {
      toast('Reading ' + f.name + '…', 10000);
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
        for (let i = 1; i <= pdf.numPages; i++) addPage(await renderPdfPage(pdf, i), `${f.name} p${i}`);
      } else {
        addPage(await loadImage(f), f.name);
      }
    } catch (err) { console.error(err); toast('Could not read ' + f.name + ': ' + err.message, 6000); }
  }
  toast(`${docState.pages.length} page(s) loaded`);
  renderTray(); renderSlots();
});

async function renderPdfPage(pdf, n) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(200 / 72, 3000 / Math.max(base.width, base.height)); // ~200 dpi, capped
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
async function loadImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 3500 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function cloneCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
function addPage(canvas, name) { docState.pages.push({ id: uid(), name, orig: canvas, canvas: cloneCanvas(canvas), slot: 0 }); }
function thumb(c) {
  const k = Math.min(1, 300 / Math.max(c.width, c.height));
  const t = document.createElement('canvas'); t.width = Math.max(1, c.width * k); t.height = Math.max(1, c.height * k);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

function renderTray() {
  const own = db.settings.slots.filter(s => !s.source);
  $('#tray').innerHTML = docState.pages.map((p, i) => `
    <div class="pg ${p.slot ? '' : 'unassigned'}" data-id="${p.id}">
      <img src="${thumb(p.canvas)}" title="Click to edit">
      <div>${i + 1}. ${esc(p.name)}</div>
      <select data-assign="${p.id}"><option value="0">— not used —</option>
        ${own.map(s => `<option value="${s.no}" ${s.no === p.slot ? 'selected' : ''}>${s.no}. ${esc(s.name)}</option>`).join('')}</select>
      <button class="small danger" data-remove="${p.id}">Remove</button>
    </div>`).join('') || '<p class="muted">No pages yet.</p>';
}
$('#tray').addEventListener('change', e => {
  const id = e.target.dataset.assign; if (!id) return;
  docState.pages.find(p => p.id === id).slot = +e.target.value;
  renderTray(); renderSlots();
});
$('#tray').addEventListener('click', e => {
  if (e.target.dataset.remove) {
    docState.pages = docState.pages.filter(p => p.id !== e.target.dataset.remove); renderTray(); renderSlots(); return;
  }
  if (e.target.tagName === 'IMG') openEditor(e.target.closest('.pg').dataset.id);
});

$('#docAuto').addEventListener('click', () => {
  const free = docState.pages.filter(p => !p.slot);
  let i = 0;
  for (const s of db.settings.slots.filter(s => !s.source)) {
    if (docState.pages.some(p => p.slot === s.no)) continue; // already filled by hand
    for (let n = 0; n < (s.pages || 1) && i < free.length; n++) free[i++].slot = s.no;
  }
  renderTray(); renderSlots();
  toast(i < free.length ? `${free.length - i} extra page(s) left unassigned` : 'Pages assigned in stack order — check each slot');
});
$('#docClear').addEventListener('click', () => {
  if (docState.pages.length && !confirm('Remove all loaded pages?')) return;
  docState.pages = []; docState.results = {}; renderTray(); renderSlots();
});

function pagesForSlot(s) {
  const src = s.source ? slotByNo(s.source) : s;
  return src ? docState.pages.filter(p => p.slot === src.no) : [];
}

function renderSlots() {
  $('#slots').innerHTML = db.settings.slots.map(s => {
    const pgs = pagesForSlot(s), r = docState.results[s.no];
    return `<div class="slot">
      <div><b>${s.no}. ${esc(s.name)}</b><div class="spec">${esc(specText(s))}${s.source ? ` · reuses slot ${s.source}` : ''}${s.stamp ? ` · label “${esc(labelFor(s))}”` : ''}</div></div>
      <div class="thumbs">${pgs.map(p => `<img src="${thumb(p.canvas)}">`).join('') || '<span class="muted">no page assigned</span>'}</div>
      <div class="out">${r ? (r.url ? `<img src="${r.url}">` : '') +
        `<div class="${r.ok ? 'ok' : 'bad'}">${esc(r.msg)}</div>` +
        (r.blob ? `<button class="small" data-dl="${s.no}">Download</button>` : '') : ''}</div>
    </div>`;
  }).join('');
}
$('#slots').addEventListener('click', e => {
  const no = e.target.dataset.dl; if (!no) return;
  const r = docState.results[no]; download(r.blob, r.file);
});

// --- image operations

function stampCanvas(c, s) {
  if (!s.stamp) return c;
  const mode = db.settings.stampMode, color = db.settings.stampColor;
  const bandH = Math.max(40, Math.round(c.width * 0.07));
  const out = document.createElement('canvas');
  out.width = c.width; out.height = c.height + (mode === 'band' ? bandH : 0);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(c, 0, mode === 'band' ? bandH : 0);
  const pad = Math.round(c.width * 0.04);
  if (s.stampImg && stampImgCache[s.no]) {
    const im = stampImgCache[s.no], k = (bandH * 0.9) / im.height;
    ctx.drawImage(im, pad, bandH * 0.05, im.width * k, im.height * k);
  } else {
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(bandH * 0.7)}px Caveat, "Segoe Print", "Comic Sans MS", cursive`;
    ctx.fillText(labelFor(s), pad, bandH * 0.52);
  }
  return out;
}
const stampImgCache = {};
async function loadStampImages() {
  for (const s of db.settings.slots) {
    if (!s.stampImg) { delete stampImgCache[s.no]; continue; }
    const im = new Image(); im.src = s.stampImg; await im.decode().catch(() => {}); stampImgCache[s.no] = im;
  }
}

function stackVertical(cs) {
  if (cs.length === 1) return cs[0];
  const w = Math.min(2400, Math.max(...cs.map(c => c.width)));
  const hs = cs.map(c => Math.round(c.height * w / c.width));
  const out = document.createElement('canvas'); out.width = w; out.height = hs.reduce((a, b) => a + b, 0);
  const ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  let y = 0; cs.forEach((c, i) => { ctx.drawImage(c, 0, y, w, hs[i]); y += hs[i]; });
  return out;
}

// Resize to the slot's pixel limits. Exact size = centre-crop to aspect, then scale.
function fitCanvas(c, s, extraScale = 1) {
  let sx = 0, sy = 0, sw = c.width, sh = c.height, tw, th;
  if (s.exact && s.w && s.h) {
    const ar = s.w / s.h;
    if (sw / sh > ar) { sw = Math.round(sh * ar); sx = Math.round((c.width - sw) / 2); }
    else { sh = Math.round(sw / ar); sy = Math.round((c.height - sh) / 2); }
    tw = s.w; th = s.h;
  } else {
    const k = Math.min(1, s.w ? s.w / sw : 1, s.h ? s.h / sh : 1) * extraScale;
    tw = Math.max(1, Math.round(sw * k)); th = Math.max(1, Math.round(sh * k));
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(c, sx, sy, sw, sh, 0, 0, tw, th);
  return out;
}
const toBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));

// Highest quality that fits under maxKB; shrink the image if even low quality is too big.
async function encodeJpeg(c, s) {
  const maxB = (s.maxKB || 1e6) * 1024, minB = (s.minKB || 0) * 1024;
  let scale = 1, best = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const fc = fitCanvas(c, s, scale);
    let lo = 0.3, hi = 0.95, fit = null;
    const top = await toBlob(fc, hi);
    if (top.size <= maxB) fit = { blob: top, c: fc };
    else {
      for (let i = 0; i < 7; i++) {
        const q = (lo + hi) / 2, b = await toBlob(fc, q);
        if (b.size <= maxB) { fit = { blob: b, c: fc }; lo = q; } else hi = q;
      }
      if (!fit) { const b = await toBlob(fc, 0.3); if (b.size <= maxB) fit = { blob: b, c: fc }; }
    }
    if (fit) {
      best = fit;
      if (fit.blob.size >= minB) break;
      // under the minimum: allow enlarging (only possible when not fixed size)
      if (s.exact || scale >= 3) break;
      scale *= 1.4; continue;
    }
    if (s.exact && s.w && s.h) break;
    scale *= 0.8;
  }
  return best;
}

async function encodePdf(cs, s) {
  const { jsPDF } = window.jspdf;
  const maxB = (s.maxKB || 1e6) * 1024;
  let scale = 1, q = 0.85, last = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const doc = new jsPDF({ unit: 'pt', compress: true, format: 'a4' });
    cs.forEach((c, i) => {
      const fc = fitCanvas(c, { ...s, exact: false, w: s.w || 1800, h: s.h || 2600 }, scale);
      const W = 595, H = Math.round(595 * fc.height / fc.width);
      if (i === 0) { doc.deletePage(1); }
      doc.addPage([W, H], W > H ? 'l' : 'p');
      doc.addImage(fc.toDataURL('image/jpeg', q), 'JPEG', 0, 0, W, H);
    });
    last = doc.output('blob');
    if (last.size <= maxB) break;
    if (q > 0.45) q -= 0.15; else scale *= 0.8;
  }
  return last;
}

$('#docBuild').addEventListener('click', buildAll);
async function buildAll() {
  $('#docStatus').textContent = 'Building…';
  await document.fonts.load('600 40px Caveat').catch(() => {});
  await loadStampImages();
  const st = db.students.find(s => s.id === $('#docStudent').value);
  for (const r of Object.values(docState.results)) if (r.url) URL.revokeObjectURL(r.url);
  docState.results = {};
  let okCount = 0;
  for (const s of db.settings.slots) {
    const pgs = pagesForSlot(s);
    if (!pgs.length) { docState.results[s.no] = { ok: false, msg: 'Missing — no page assigned' }; continue; }
    const file = `${String(s.no).padStart(2, '0')}_${safeName(s.name)}.${s.fmt}`;
    let blob;
    if (s.fmt === 'pdf') {
      const cs = pgs.map(p => p.canvas); cs[0] = stampCanvas(cs[0], s);
      blob = await encodePdf(cs, s);
    } else {
      const res = await encodeJpeg(stampCanvas(stackVertical(pgs.map(p => p.canvas)), s), s);
      blob = res && res.blob;
    }
    if (!blob) { docState.results[s.no] = { ok: false, msg: 'Could not encode' }; continue; }
    const kb = blob.size / 1024;
    const ok = kb <= (s.maxKB || 1e9) && kb >= (s.minKB || 0);
    if (ok) okCount++;
    docState.results[s.no] = { ok, blob, file, url: s.fmt === 'jpg' ? URL.createObjectURL(blob) : '',
      msg: `${file} · ${kb.toFixed(1)} KB ${ok ? '✓' : '✗ outside ' + (s.minKB || 0) + '-' + s.maxKB + ' KB'}` };
    renderSlots();
    await new Promise(r => setTimeout(r));
  }
  renderSlots();
  $('#docStatus').textContent = `${okCount} / ${db.settings.slots.length} files ready${st ? ' for ' + st.name : ''}`;
}

$('#docZip').addEventListener('click', async () => {
  const ready = Object.values(docState.results).filter(r => r.blob);
  if (!ready.length) return toast('Build the files first');
  const st = db.students.find(s => s.id === $('#docStudent').value);
  const folder = safeName(st ? st.name : 'student') + '_CN_documents';
  const zip = new JSZip(), dir = zip.folder(folder);
  ready.forEach(r => dir.file(r.file, r.blob));
  dir.file('summary.txt', db.settings.slots.map(s => {
    const r = docState.results[s.no];
    return `${s.no}. ${s.name}: ${r ? r.msg : 'not built'}`;
  }).join('\r\n'));
  download(await zip.generateAsync({ type: 'blob' }), folder + '.zip');
});

$('#docChecklist').addEventListener('click', () => {
  const st = db.students.find(s => s.id === $('#docStudent').value);
  let n = 0;
  const rows = db.settings.slots.filter(s => !s.source).map(s => {
    const from = n + 1; n += (s.pages || 1);
    const reused = db.settings.slots.filter(x => x.source === s.no).map(x => `${x.no}. ${x.name}`);
    return `<tr><td>${from === n ? n : from + '-' + n}</td><td>${esc(s.no + '. ' + s.name)}${reused.length ? `<br><small>also used for: ${esc(reused.join(', '))}</small>` : ''}</td>
      <td>${s.stamp ? '☐ self-attested' : '—'}</td><td>☐</td></tr>`;
  }).join('');
  printPapers(`<div class="paper"><b>Scan stack order - ${esc(st ? st.name : '')}</b>

Put the pages in the feeder in this order (top first) and scan once as a single PDF.
The student signs every page marked "self-attested" before scanning.

<table class="checklist"><tr><th>Page</th><th>Document</th><th>Student signs</th><th>In stack</th></tr>${rows}</table></div>`);
});

// --- page editor

const ed = { page: null, sel: null, drag: null };
function openEditor(id) {
  ed.page = docState.pages.find(p => p.id === id); ed.sel = null;
  const s = slotByNo(ed.page.slot);
  ed.aspect = s && s.exact && s.w && s.h ? s.w / s.h : 0;
  $('#edTitle').textContent = ed.page.name + (s ? ` → ${s.no}. ${s.name}` : '');
  $('#edHint').innerHTML = 'Drag on the page to select the area to keep, then <b>Apply crop</b>.' + (ed.aspect ? ' (Crop is locked to this slot\'s photo shape.)' : '');
  $('#editor').classList.remove('hidden');
  drawEditor();
}
function drawEditor() {
  const c = $('#edCanvas'), src = ed.page.canvas;
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
  if (ed.sel) {
    const { x, y, w, h } = normSel(ed.sel);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, c.width, y); ctx.fillRect(0, y + h, c.width, c.height - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, c.width - x - w, h);
    ctx.strokeStyle = '#2f6bff'; ctx.lineWidth = Math.max(2, c.width / 400); ctx.strokeRect(x, y, w, h);
  }
}
function normSel({ x0, y0, x1, y1 }) {
  let w = x1 - x0, h = y1 - y0;
  if (ed.aspect) { const ah = Math.abs(w) / ed.aspect; h = Math.sign(h || 1) * ah; }
  return { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
}
function canvasPt(e) {
  const c = $('#edCanvas'), r = c.getBoundingClientRect();
  return { x: Math.max(0, Math.min(c.width, (e.clientX - r.left) * c.width / r.width)), y: Math.max(0, Math.min(c.height, (e.clientY - r.top) * c.height / r.height)) };
}
$('#edCanvas').addEventListener('pointerdown', e => {
  const p = canvasPt(e); ed.sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; ed.drag = true;
  e.target.setPointerCapture(e.pointerId);
});
$('#edCanvas').addEventListener('pointermove', e => { if (!ed.drag) return; const p = canvasPt(e); ed.sel.x1 = p.x; ed.sel.y1 = p.y; drawEditor(); });
$('#edCanvas').addEventListener('pointerup', () => { ed.drag = false; });

function rotate(c, dir) {
  const o = document.createElement('canvas'); o.width = c.height; o.height = c.width;
  const ctx = o.getContext('2d'); ctx.translate(o.width / 2, o.height / 2); ctx.rotate(dir * Math.PI / 2);
  ctx.drawImage(c, -c.width / 2, -c.height / 2); return o;
}
// Stretch levels so paper goes white and ink stays dark (keeps colour).
function clean(c) {
  const o = cloneCanvas(c), ctx = o.getContext('2d'), img = ctx.getImageData(0, 0, o.width, o.height), d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  const total = d.length / 4; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.35) { hi = v; break; } }
  hi = Math.max(hi - 8, lo + 40);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - lo) * 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0); return o;
}
$('#editor').addEventListener('click', e => {
  const a = e.target.dataset.ed; if (!a) return;
  const p = ed.page;
  if (a === 'rotl' || a === 'rotr') { p.canvas = rotate(p.canvas, a === 'rotl' ? -1 : 1); ed.sel = null; }
  if (a === 'crop') {
    if (!ed.sel) return toast('Drag a box on the page first');
    const { x, y, w, h } = normSel(ed.sel);
    if (w < 10 || h < 10) return toast('Selection too small');
    const o = document.createElement('canvas'); o.width = Math.round(w); o.height = Math.round(h);
    o.getContext('2d').drawImage(p.canvas, x, y, w, h, 0, 0, o.width, o.height); p.canvas = o; ed.sel = null;
  }
  if (a === 'clean') p.canvas = clean(p.canvas);
  if (a === 'reset') { p.canvas = cloneCanvas(p.orig); ed.sel = null; }
  if (a === 'close') { $('#editor').classList.add('hidden'); renderTray(); renderSlots(); return; }
  drawEditor();
});

// ---------------------------------------------------------------- settings

function renderSettings() {
  const c = db.settings.company;
  $('#companyForm').innerHTML = [['name', 'Company name'], ['address', 'Address (multi-line)'], ['phone', 'Phone'], ['email', 'Email'],
    ['signatory', 'Signed by (name)'], ['designation', 'Designation']]
    .map(([k, l]) => k === 'address'
      ? `<label>${l}<textarea data-co="${k}" rows="3">${esc(c[k])}</textarea></label>`
      : `<label>${l}<input data-co="${k}" value="${esc(c[k])}"></label>`).join('');

  $('#stampMode').value = db.settings.stampMode; $('#stampColor').value = db.settings.stampColor;
  $('#slotTable').innerHTML = `<tr><th>No</th><th>Portal name</th><th>Label written on top</th><th>Type</th><th>Min KB</th><th>Max KB</th>
    <th>Width px</th><th>Height px</th><th>Exact size</th><th>Pages in stack</th><th>Reuse slot</th><th>Add label</th><th>Own handwriting image</th><th></th></tr>` +
    db.settings.slots.map((s, i) => `<tr data-i="${i}">
      <td><input type="number" data-s="no" value="${s.no}"></td>
      <td><input data-s="name" value="${esc(s.name)}"></td>
      <td><input data-s="label" value="${esc(s.label)}" placeholder="${esc(labelFor({ ...s, label: '' }))}"></td>
      <td><select data-s="fmt"><option ${s.fmt === 'jpg' ? 'selected' : ''}>jpg</option><option ${s.fmt === 'pdf' ? 'selected' : ''}>pdf</option></select></td>
      <td><input type="number" data-s="minKB" value="${s.minKB}"></td><td><input type="number" data-s="maxKB" value="${s.maxKB}"></td>
      <td><input type="number" data-s="w" value="${s.w || ''}"></td><td><input type="number" data-s="h" value="${s.h || ''}"></td>
      <td><input type="checkbox" data-s="exact" ${s.exact ? 'checked' : ''}></td>
      <td><input type="number" data-s="pages" value="${s.pages || 1}" min="1"></td>
      <td><select data-s="source"><option value="0">—</option>${db.settings.slots.filter(x => x.no !== s.no && !x.source)
        .map(x => `<option value="${x.no}" ${x.no === s.source ? 'selected' : ''}>${x.no}</option>`).join('')}</select></td>
      <td><input type="checkbox" data-s="stamp" ${s.stamp ? 'checked' : ''}></td>
      <td>${s.stampImg ? `<img src="${s.stampImg}" style="height:22px;max-width:120px"> <button class="small" data-clearimg>✕</button>`
        : `<label class="filebtn small">Upload<input type="file" accept="image/*" data-stampimg></label>`}</td>
      <td><button class="small danger" data-delslot>✕</button></td></tr>`).join('') +
    `<tr><td colspan="14"><button class="small" id="addSlot">+ Add slot</button></td></tr>`;

  $('#boardForm').innerHTML = Object.entries(db.settings.boards).map(([k, b]) => `
    <h3>${esc(b.name)}</h3><div class="grid2" data-board="${k}">
      <label>10th exam name<input data-b="exam10" value="${esc(b.exam10)}"></label>
      <label>10th fee / DD details<input data-b="fee10" value="${esc(b.fee10)}"></label>
      <label>10th BVC address<textarea data-b="addr10" rows="5">${esc(b.addr10)}</textarea></label>
      <label>12th exam name<input data-b="exam12" value="${esc(b.exam12)}"></label>
      <label>12th fee / DD details<input data-b="fee12" value="${esc(b.fee12)}"></label>
      <label>12th BVC address<textarea data-b="addr12" rows="5">${esc(b.addr12)}</textarea></label>
    </div>`).join('');

  $('#tplRequest').value = db.settings.tplRequest; $('#tplConsent').value = db.settings.tplConsent;
  $('#placeholderList').textContent = Object.keys(letterVars({}, '10')).map(k => `{{${k}}}`).join(' ');
}

$('#companyForm').addEventListener('input', e => { const k = e.target.dataset.co; if (k) { db.settings.company[k] = e.target.value; save(); } });
$('#stampMode').addEventListener('change', e => { db.settings.stampMode = e.target.value; save(); });
$('#stampColor').addEventListener('input', e => { db.settings.stampColor = e.target.value; save(); });
$('#slotTable').addEventListener('change', async e => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const s = db.settings.slots[+tr.dataset.i], k = e.target.dataset.s;
  if (e.target.dataset.stampimg != null) {
    const f = e.target.files[0]; if (!f) return;
    const c = await loadImage(f), k2 = Math.min(1, 120 / c.height);
    const t = document.createElement('canvas'); t.width = c.width * k2; t.height = c.height * k2;
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    s.stampImg = t.toDataURL('image/png'); save(); renderSettings(); return;
  }
  if (!k) return;
  if (e.target.type === 'checkbox') s[k] = e.target.checked;
  else if (['no', 'minKB', 'maxKB', 'w', 'h', 'pages', 'source'].includes(k)) s[k] = +e.target.value || 0;
  else s[k] = e.target.value;
  if (k === 'no') db.settings.slots.sort((a, b) => a.no - b.no);
  save(); if (['no', 'source'].includes(k)) renderSettings();
});
$('#slotTable').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]');
  if (e.target.id === 'addSlot') {
    const no = Math.max(0, ...db.settings.slots.map(s => s.no)) + 1;
    db.settings.slots.push({ no, name: 'New document', label: '', fmt: 'jpg', minKB: 10, maxKB: 200, w: 1800, h: 1800, exact: false, pages: 1, source: 0, stamp: true, stampImg: '' });
  } else if (tr && e.target.dataset.delslot != null) {
    if (!confirm('Delete this slot?')) return;
    const gone = db.settings.slots.splice(+tr.dataset.i, 1)[0];
    db.settings.slots.forEach(s => { if (s.source === gone.no) s.source = 0; });
  } else if (tr && e.target.dataset.clearimg != null) {
    db.settings.slots[+tr.dataset.i].stampImg = '';
  } else return;
  save(); renderSettings();
});
$('#slotReset').addEventListener('click', () => { if (confirm('Replace your slot table with the defaults?')) { db.settings.slots = structuredClone(DEFAULT_SLOTS); save(); renderSettings(); } });
$('#boardForm').addEventListener('input', e => {
  const k = e.target.dataset.b, bk = e.target.closest('[data-board]')?.dataset.board; if (!k || !bk) return;
  db.settings.boards[bk][k] = e.target.value; save();
});
$('#tplRequest').addEventListener('input', e => { db.settings.tplRequest = e.target.value; save(); });
$('#tplConsent').addEventListener('input', e => { db.settings.tplConsent = e.target.value; save(); });
$('#tplReset').addEventListener('click', () => {
  if (!confirm('Reset both letter templates to the defaults?')) return;
  db.settings.tplRequest = DEFAULT_TPL_REQUEST; db.settings.tplConsent = DEFAULT_TPL_CONSENT; save(); renderSettings();
});
$('#exportAll').addEventListener('click', () => {
  download(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }), `cn-desk-backup-${todayIso()}.json`);
});
$('#importAll').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.students)) throw new Error('not a CN Desk backup');
    if (!confirm(`Replace current data with backup (${d.students.length} students)?`)) return;
    localStorage.setItem(KEY, JSON.stringify(d)); db = load();
    currentId = null; renderAll(); toast('Backup restored');
  } catch (err) { toast('Import failed: ' + err.message, 5000); }
});

// ---------------------------------------------------------------- boot

function renderAll() { renderStudentList(); renderEditor(); renderSettings(); fillStudentSelects(); renderTray(); renderSlots(); }
renderAll();
