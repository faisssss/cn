// Turning what Claude read off the documents into Pariksha form values, plus the checks.
// Pure functions only (no DOM), so they can be tested in Node.

export const CLAUDE_PROMPT = `You are reading Indian school documents for a DGCA Pariksha (Computer Number) application.
The attached PDF has these pages, in order:
  1. 10th (SSLC) pass certificate
  2. 10th marksheet
  3. 12th (Higher Secondary) certificate / marksheet
  4. Aadhaar card (front and back)

Copy every value EXACTLY as printed (same spelling, same initials, same order). Do not correct, guess or expand anything.
If a value is not printed or you cannot read it with certainty, use null.
Dates as DD-MM-YYYY. Numbers as plain digits (no "/" or words).

Reply with ONLY this JSON inside one \`\`\`json code block, nothing else:

\`\`\`json
{
  "tenth_certificate": {
    "name": "", "father_name": "", "mother_name": "", "date_of_birth": "", "year_of_passing": ""
  },
  "tenth_marksheet": {
    "name": "", "total_obtained": 0, "total_maximum": 0, "year_of_passing": ""
  },
  "twelfth_certificate": {
    "name": "", "father_name": "", "mother_name": "", "date_of_birth": "", "year_of_passing": "",
    "total_obtained": 0, "total_maximum": 0,
    "physics_obtained": 0, "physics_maximum": 0,
    "maths_obtained": 0, "maths_maximum": 0,
    "english_obtained": 0, "english_maximum": 0
  },
  "aadhaar": {
    "name": "", "date_of_birth": "", "gender": "", "aadhaar_number": "",
    "care_of": "", "house": "", "street": "", "landmark": "", "locality": "",
    "village_town_city": "", "post_office": "", "sub_district": "", "district": "", "state": "", "pin_code": ""
  }
}
\`\`\`

Notes:
- For the 12th, subject marks are the subject TOTAL (all parts added, usually out of 200) as printed on the certificate.
- "total_obtained" / "total_maximum" are the grand totals printed on that document (e.g. 395 / 650, 792 / 1200).
- aadhaar_number: the 12 digits without spaces. care_of: the "S/O", "D/O", "C/O" or "W/O" line exactly as printed.`;

// ---------- parsing ----------

export function parseClaudeReply(text) {
  const t = String(text || '');
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : t;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON found. Copy the whole answer from Claude, including the { } part.');
  body = body.slice(a, b + 1);
  let data;
  try { data = JSON.parse(body); }
  catch (e) { throw new Error('The answer is not complete JSON (' + e.message + '). Ask Claude to resend it.'); }
  for (const k of ['tenth_certificate', 'tenth_marksheet', 'twelfth_certificate', 'aadhaar']) {
    if (!data[k] || typeof data[k] !== 'object') throw new Error(`Missing section "${k}" in Claude's answer.`);
  }
  return data;
}

// ---------- small helpers ----------

const str = v => (v == null ? '' : String(v)).trim();
export const lettersOnly = s => str(s).toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const normName = s => lettersOnly(s).replace(/\s+/g, '');
const num = v => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
export function normDate(s) {
  const m = str(s).match(/(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})/);
  if (!m) return str(s);
  return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
}
const year = s => (str(s).match(/(19|20)\d{2}/) || [''])[0];

// Percentage cut off (not rounded) after 2 decimals; whole numbers without decimals: 60.76, 66
export function percent(obt, max) {
  if (!(max > 0) || obt == null) return '';
  const hundredths = Math.floor((obt * 10000) / max + 1e-9);
  return String(hundredths / 100);
}

// Ms / FATHIMA / SHERIN / P P : first word, middle words, trailing initials as last name.
export function splitName(full) {
  const t = lettersOnly(full).split(' ').filter(Boolean);
  if (!t.length) return { first: '', middle: '', last: '' };
  if (t.length === 1) return { first: t[0], middle: '', last: '' };
  const isInit = w => w.length === 1;
  let end = t.length;
  while (end > 1 && isInit(t[end - 1])) end--;
  if (end < t.length) { // trailing initials
    return { first: t[0], middle: t.slice(1, end).join(' '), last: t.slice(end).join(' ') };
  }
  let start = 0;
  while (start < t.length - 1 && isInit(t[start])) start++;
  if (start > 0) { // leading initials (K P RAHUL)
    return { first: t[start], middle: t.slice(start + 1).join(' '), last: t.slice(0, start).join(' ') };
  }
  return { first: t[0], middle: t.slice(1, -1).join(' '), last: t[t.length - 1] };
}

// Whole Aadhaar address into 3 lines; city = village/town/city, or the district if none.
export function splitAddress(a) {
  const city = lettersOnlyKeepPunct(a.village_town_city) || lettersOnlyKeepPunct(a.district);
  const po = str(a.post_office);
  const parts = [a.house, a.street, a.landmark, a.locality,
    po && !/\bP\.?\s?O\b/i.test(po) ? po + ' PO' : po,
    a.sub_district]
    .map(lettersOnlyKeepPunct).filter(Boolean)
    .filter((p, i, arr) => arr.indexOf(p) === i && p !== city);
  const lines = ['', '', ''];
  if (parts.length <= 3) parts.forEach((p, i) => (lines[i] = p));
  else {
    // keep order, balance lengths
    const total = parts.join(', ').length;
    let li = 0;
    for (const p of parts) {
      if (li < 2 && lines[li] && (lines[li] + ', ' + p).length > total / 3 + 6) li++;
      lines[li] = lines[li] ? lines[li] + ', ' + p : p;
    }
  }
  return { addr1: lines[0], addr2: lines[1], addr3: lines[2], city };
}
function lettersOnlyKeepPunct(s) {
  return str(s).toUpperCase().replace(/[^A-Z0-9 ,.\-\/()]+/g, ' ').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');
}

// Verhoeff check digit used by Aadhaar
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function aadhaarValid(n) {
  const s = str(n).replace(/\s/g, '');
  if (!/^[2-9]\d{11}$/.test(s)) return false;
  let c = 0;
  s.split('').reverse().forEach((d, i) => { c = D[c][P[i % 8][+d]]; });
  return c === 0;
}

// ---------- building the student's details ----------

export function buildDetails(r, contact = {}) {
  const t = r.tenth_certificate, m = r.tenth_marksheet, w = r.twelfth_certificate, a = r.aadhaar;
  const name = splitName(t.name || w.name || a.name);
  const genderRaw = str(contact.gender || a.gender).toLowerCase();
  const gender = genderRaw.startsWith('f') ? 'Female' : genderRaw.startsWith('m') ? 'Male' : '';
  const addr = splitAddress(a);
  const d = {
    title: gender === 'Female' ? 'Ms' : gender === 'Male' ? 'Mr' : '',
    firstName: name.first, middleName: name.middle, lastName: name.last,
    mother: lettersOnly(t.mother_name || w.mother_name),
    father: lettersOnly(t.father_name || w.father_name),
    dob: normDate(t.date_of_birth || w.date_of_birth || a.date_of_birth),
    gender,
    aadhaar: str(a.aadhaar_number).replace(/\D/g, ''),
    mobile: str(contact.mobile).replace(/\D/g, ''),
    email: str(contact.email),
    ...addr,
    state: 'Kerala', country: 'India',
    pin: str(a.pin_code).replace(/\D/g, ''),
    y10: year(t.year_of_passing || m.year_of_passing),
    m10obt: num(m.total_obtained), m10max: num(m.total_maximum),
    y12: year(w.year_of_passing),
    m12obt: num(w.total_obtained), m12max: num(w.total_maximum),
    phy: num(w.physics_obtained), maths: num(w.maths_obtained), eng: num(w.english_obtained),
    phyMax: num(w.physics_maximum) || 200, mathsMax: num(w.maths_maximum) || 200, engMax: num(w.english_maximum) || 200,
  };
  return d;
}

export const derived = d => ({
  p10: percent(d.m10obt, d.m10max),
  p12: percent(d.m12obt, d.m12max),
  fullName: [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' '),
});

// Warnings: level 'red' must be looked at, 'orange' worth a look.
export function checkDetails(d, r) {
  const out = [];
  const add = (level, field, text) => out.push({ level, field, text, id: field + ':' + text });
  const req = { firstName: 'First name', mother: "Mother's name", father: "Father's name", dob: 'Date of birth',
    gender: 'Gender', mobile: 'Mobile', email: 'Email', addr1: 'Address line 1', city: 'Village/Town/City', pin: 'PIN',
    y10: '10th year', m10obt: '10th marks', m10max: '10th maximum', y12: '12th year', m12obt: '12th marks',
    m12max: '12th maximum', phy: 'Physics marks', maths: 'Maths marks', eng: 'English marks' };
  for (const [k, label] of Object.entries(req)) if (d[k] == null || d[k] === '') add('red', k, `${label} is empty`);

  if (d.mobile && !/^\d{10}$/.test(d.mobile)) add('red', 'mobile', 'Mobile must be 10 digits');
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) add('red', 'email', 'Email does not look valid');
  if (d.pin && !/^\d{6}$/.test(d.pin)) add('red', 'pin', 'PIN must be 6 digits');
  if (d.aadhaar && !aadhaarValid(d.aadhaar)) add('red', 'aadhaar', 'Aadhaar number fails its check digit (a digit is probably misread)');
  if (!d.aadhaar) add('orange', 'aadhaar', 'Aadhaar number is empty (optional at registration, needed later)');
  if (d.dob && !/^\d{2}-\d{2}-\d{4}$/.test(d.dob)) add('red', 'dob', 'Date of birth must be DD-MM-YYYY');

  const over = (o, m, label, field) => { if (o != null && m != null && o > m) add('red', field, `${label}: ${o} is more than the maximum ${m}`); };
  over(d.m10obt, d.m10max, '10th marks', 'm10obt');
  over(d.m12obt, d.m12max, '12th marks', 'm12obt');
  over(d.phy, d.phyMax, 'Physics', 'phy');
  over(d.maths, d.mathsMax, 'Maths', 'maths');
  over(d.eng, d.engMax, 'English', 'eng');
  for (const [k, n] of [['phyMax', 'Physics'], ['mathsMax', 'Maths'], ['engMax', 'English']]) {
    if (d[k] !== 200) add('orange', k, `${n} maximum is ${d[k]}, not the usual 200`);
  }
  if (d.m12max != null && d.m12max !== 1200) add('orange', 'm12max', `12th maximum is ${d.m12max}, not the usual 1200`);
  for (const k of ['addr1', 'addr2', 'addr3']) if ((d[k] || '').length > 60) add('orange', k, `${k.replace('addr', 'Address line ')} is long (${d[k].length} characters)`);

  if (r) {
    const t = r.tenth_certificate, w = r.twelfth_certificate, a = r.aadhaar;
    const cmp = (label, field, vals) => {
      const present = vals.filter(([, v]) => str(v));
      const uniq = [...new Set(present.map(([, v]) => normName(v)))];
      if (uniq.length > 1) add('red', field, `${label} differs: ` + present.map(([src, v]) => `${src} "${str(v)}"`).join(', '));
    };
    cmp('Name', 'firstName', [['10th', t.name], ['12th', w.name], ['Aadhaar', a.name]]);
    cmp("Father's name", 'father', [['10th', t.father_name], ['12th', w.father_name]]);
    const co = str(a.care_of);
    if (/^\s*[SD]\s*\/?\s*O\b/i.test(co) && str(d.father)) {
      const onAadhaar = co.replace(/^\s*[SD]\s*\/?\s*O\s*:?\s*/i, '');
      if (normName(onAadhaar) !== normName(d.father)) {
        add('orange', 'father', `Father's name on Aadhaar ("${onAadhaar}") is not the same as "${d.father}"`);
      }
    }
    cmp("Mother's name", 'mother', [['10th', t.mother_name], ['12th', w.mother_name]]);
    const dates = [['10th', t.date_of_birth], ['12th', w.date_of_birth], ['Aadhaar', a.date_of_birth]]
      .filter(([, v]) => str(v)).map(([s, v]) => [s, normDate(v)]);
    if (new Set(dates.map(([, v]) => v)).size > 1) add('red', 'dob', 'Date of birth differs: ' + dates.map(([s, v]) => `${s} ${v}`).join(', '));
    if (/[^A-Za-z\s]/.test(str(t.name))) add('orange', 'firstName', 'Dots/symbols removed from the name (Pariksha allows letters only)');
  }
  return out;
}

export const DEFAULT_OPTIONS = {
  category: 'CPL', nationality: 'INDIA',
  licence: 'NO', govt: 'NO', defence: 'NO', abroad: 'NO', sameAddress: 'YES', additionalDoc: 'NO',
};
