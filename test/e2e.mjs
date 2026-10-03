// End-to-end test: loads the extension in Chromium, serves test copies of the Pariksha pages,
// and walks one fake student through every step.
// Usage: node test/e2e.mjs <dir with stack.pdf, bvc10.pdf, bvc12.pdf, photo.png> <screenshot dir>
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EXT = path.join(ROOT, 'extension'), FIX = path.join(ROOT, 'test', 'fixtures');
const DATA = process.argv[2], SHOTS = process.argv[3] || os.tmpdir();
const ROUTES = {
  '/': 'welcome.html', '/welcome.jsp': 'welcome.html', '/home': 'home.html', '/Form/Terms_and_Conditions': 'terms.html',
  '/Form/regwithdigi': 'regwithdigi.html', '/Form/New_Candidate_Registration_For_Flight_Crew': 'register.html', '/login': 'login.html',
  '/digilocker.jsp': 'digilocker.html', '/Form/Personal_Details_of_Flight_Crew': 'personal.html', '/Form/Flight_Crew_Details': 'flight.html',
  '/Form/Document': 'documents.html',
};
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'cnd-')), {
  executablePath: '/opt/pw-browsers/chromium', headless: false, viewport: { width: 1100, height: 1000 },
  args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://pariksha.dgca.gov.in/**', route => {
  const p = new URL(route.request().url()).pathname;
  const file = p.startsWith('/vendor/') || p === '/shim.js' ? p.slice(1) : ROUTES[p];
  if (!file) return route.fulfill({ status: 200, contentType: 'text/html', body: `<h1>stub ${p}</h1>` });
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
  route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(path.join(FIX, file)) });
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const errors = [];
const panel = await ctx.newPage();
panel.on('pageerror', e => errors.push('panel: ' + e.message));
panel.on('console', m => { if (m.type() === 'error' && !/XNNPACK/.test(m.text())) errors.push('panel console: ' + m.text()); });
panel.on('dialog', d => d.accept());
await panel.goto(`chrome-extension://${id}/panel.html`);
const state = async () => { await panel.waitForTimeout(500); return panel.evaluate(() => JSON.parse(JSON.stringify(globalThis.__cnState()))); };
const stored = () => panel.evaluate(async () => (await chrome.storage.session.get(['cn', 'cnImg'])));
const shot = n => panel.screenshot({ path: path.join(SHOTS, n), fullPage: true });
const idle = () => panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 120000 });

// ---- 1 Start
await panel.fill('[data-c=mobile]', '9000000001');
await panel.fill('[data-c=email]', 'test.student@example.com');
await panel.check('input[data-c=gender][value=Female]');
await panel.setInputFiles('input[data-photo]', path.join(DATA, 'photo.png'));
await panel.waitForSelector('.photo-prev', { timeout: 60000 });
await panel.setInputFiles('input[data-bvc=b10]', path.join(DATA, 'bvc10.pdf')); await idle();
await panel.setInputFiles('input[data-bvc=b12]', path.join(DATA, 'bvc12.pdf')); await idle();
let S = await state();
check(S.photo && S.photo.kb < 195, `photo under 195 KB (${S.photo && S.photo.kb} KB), face found: ${S.photo && S.photo.found}`);
check(S.bvc.b10 && S.bvc.b10.pages === 2 && !S.bvc.b10.changed, 'BVC 10th: 2 pages, used as-is ' + JSON.stringify(S.bvc));
await shot('1-start.png');

// ---- 2 Scan
await panel.click('[data-step=scan]');
await panel.setInputFiles('input[data-stack]', path.join(DATA, 'stack.pdf'));
await idle();
check(await panel.locator('.box.empty').count() === 0, 'stack PDF filled all 5 boxes');
await shot('2-scan.png');

// ---- 3 Read
await panel.click('[data-step=read]');
await panel.click('[data-act=prepClaude]'); await idle();
S = await state();
check(S.claudeDl != null, 'PDF for Claude saved to Downloads');
const st = await stored();
check(st.cnImg && Object.keys(st.cnImg.pages).length === 5 && st.cnImg.photo, 'scans + photo kept in session memory (' + Math.round(JSON.stringify(st).length / 1024) + ' KB of 10 MB)');
const reply = '```json\n' + JSON.stringify({
  tenth_certificate: { name: 'ANITA ROSE K', father_name: 'THOMAS K J', mother_name: 'MARY T K', date_of_birth: '01/01/2007', year_of_passing: 'March 2023' },
  tenth_marksheet: { name: 'ANITA ROSE K', total_obtained: 395, total_maximum: 650, year_of_passing: '2023' },
  twelfth_certificate: { name: 'ANITA ROSE K', father_name: 'THOMAS K.J', mother_name: 'MARY T K', date_of_birth: '01-01-2007', year_of_passing: '2026',
    total_obtained: 792, total_maximum: 1200, physics_obtained: 120, physics_maximum: 200, maths_obtained: 108, maths_maximum: 200, english_obtained: 141, english_maximum: 200 },
  aadhaar: { name: 'Anita Rose K', date_of_birth: '01/01/2007', gender: 'Female', aadhaar_number: '999941057058', care_of: 'D/O Thomas K J',
    house: 'TEST HOUSE', street: 'TEST ROAD', landmark: '', locality: 'TEST TOWN', village_town_city: '', post_office: 'TEST', sub_district: '',
    district: 'ERNAKULAM', state: 'Kerala', pin_code: '682001' } }) + '\n```';
await panel.fill('#reply', reply);
await panel.click('[data-act=useReply]');
await panel.waitForSelector('[data-act=confirm]');
S = await state();
check(S.claudeDl == null, 'Claude PDF deleted from Downloads after the answer was used');
check(S.details.firstName === 'ANITA' && S.details.middleName === 'ROSE' && S.details.lastName === 'K', 'name split ANITA / ROSE / K');
await shot('4-review.png');
await panel.click('[data-act=confirm]');

// close + reopen the panel: scans, photo and details must survive
await panel.waitForTimeout(1500);
await panel.reload();
await panel.waitForSelector('canvas[data-labcanvas=cert10]', { timeout: 30000 });
await idle();
check(await panel.locator('text=Pages are not kept').count() === 0, 'scanned pages survive closing/reopening the panel');
S = await state();
check(S.files.sign && S.files.aadhaar, 'files were built automatically on opening step 5');
await panel.click('[data-step=start]');
check(await panel.locator('[data-act=photoEdit]:not([disabled])').count() === 1, 'photo crop can still be adjusted after reopening');
await panel.click('[data-step=labels]');
await panel.waitForSelector('canvas[data-labcanvas=cert10]');
await panel.click('[data-lab-rot=marks10]');
await panel.waitForTimeout(300);
S = await state();
check(S.labels.marks10.rot === 90, 'label can be turned 90°');
await panel.click('[data-lab-rot=marks10]'); await panel.click('[data-lab-rot=marks10]'); await panel.click('[data-lab-rot=marks10]');

// ---- 5 Labels & files
await panel.waitForSelector('canvas[data-labcanvas=cert10]');
await panel.waitForTimeout(800);
const cv = panel.locator('canvas[data-labcanvas=cert10]'); const box = await cv.boundingBox();
await panel.mouse.move(box.x + box.width * 0.15, box.y + 12); await panel.mouse.down();
await panel.mouse.move(box.x + box.width * 0.25, box.y + 20, { steps: 5 }); await panel.mouse.up();
await panel.click('[data-act=build]'); await idle();
S = await state();
const lim = { photo: 195, sign: 70 };
for (const [k, f] of Object.entries(S.files)) check(f.kb <= (lim[k] || 500), `${k} file ${f.kb} KB within limit`);
check(Object.keys(S.files).length === 8, 'all 8 distinct files built');
await shot('5-labels.png');
// save the built Aadhaar PDF for a look
fs.writeFileSync(path.join(SHOTS, 'aadhaar-built.pdf'), Buffer.from(S.files.aadhaar.url.split(',')[1], 'base64'));
fs.writeFileSync(path.join(SHOTS, 'cert10-built.pdf'), Buffer.from(S.files.cert10.url.split(',')[1], 'base64'));
fs.writeFileSync(path.join(SHOTS, 'photo-built.jpg'), Buffer.from(S.files.photo.url.split(',')[1], 'base64'));

// ---- 6 Pariksha: routine clicks run automatically up to the registration form
await panel.click('[data-step=pariksha]');
const pp = await ctx.newPage();
pp.on('pageerror', e => errors.push('pariksha: ' + e.message));
await pp.goto('https://pariksha.dgca.gov.in/welcome.jsp');
await pp.waitForURL('**/New_Candidate_Registration_For_Flight_Crew', { timeout: 30000 });
check(true, 'routine clicks: welcome → home → instructions → DigiLocker No → registration form');
await panel.waitForFunction(() => document.querySelector('.page-now')?.textContent.includes('Registration'));
await panel.click('[data-act=fill]');
await panel.waitForSelector('.report');
const reg = await pp.evaluate(() => Object.fromEntries(['Title', 'First_Name', 'Middle_Name', 'Last_Name', 'Mother_s_Name', 'Father_s_Name', 'Date_of_birth', 'Gender',
  'AadharNo', 'Mobile_Number', 'Confirm_Mobile_Number', 'Email_ID', 'Confirm_Email_ID'].map(i => [i, document.getElementById(i).value]).concat([['tick', document.getElementById('note_new_candidate_reg').checked]])));
console.log(reg);
check(reg.Title === 'Ms' && reg.First_Name === 'ANITA' && reg.Gender === '2' && reg.Date_of_birth === '01-01-2007' && reg.Confirm_Email_ID === 'test.student@example.com' && reg.tick, 'registration form filled');
check(await pp.evaluate(() => document.getElementById('select2-Title-container').textContent.trim()) === 'Ms', 'select2 display updated (Title shows Ms)');
check(await pp.evaluate(() => window.__posted === undefined), 'Submit was NOT pressed');
await shot('6-register.png'); await pp.screenshot({ path: path.join(SHOTS, '6-register-page.png'), fullPage: true });

// login: email filled automatically
await pp.goto('https://pariksha.dgca.gov.in/login');
await pp.waitForFunction(() => document.querySelector('input[placeholder*="Email"]').value !== '', null, { timeout: 15000 });
check(await pp.evaluate(() => document.querySelector('input[placeholder*="Email"]').value) === 'test.student@example.com', 'login email filled');

// DigiLocker skip → personal details
await pp.goto('https://pariksha.dgca.gov.in/digilocker.jsp');
await pp.waitForURL('**/Personal_Details_of_Flight_Crew', { timeout: 15000 });
await panel.waitForFunction(() => document.querySelector('.page-now')?.textContent.includes('Personal'));
await panel.click('[data-act=fill]');
await panel.waitForFunction(() => document.querySelector('.report h3'));
const per = await pp.evaluate(() => Object.fromEntries(['Address_Line_1', 'Address_Line_2', 'Address_Line_3', 'city', 'Pin', 'p_Address_Line_1', 'p_city', 'p_Pin'].map(i => [i, document.getElementById(i).value])));
console.log(per);
check(per.Address_Line_1 && per.p_Address_Line_1 === per.Address_Line_1 && per.p_Pin === '682001' && per.city === 'ERNAKULAM', 'address filled and copied to permanent (NO→YES fix)');
await shot('6-personal.png'); await pp.screenshot({ path: path.join(SHOTS, '6-personal-page.png'), fullPage: true });

// flight crew details
await pp.goto('https://pariksha.dgca.gov.in/Form/Flight_Crew_Details');
await panel.waitForFunction(() => document.querySelector('.page-now')?.textContent.includes('Flight'));
await panel.click('[data-act=fill]');
await panel.waitForFunction(() => document.querySelector('.report h3'), null, { timeout: 30000 });
const fl = await pp.evaluate(() => {
  const txt = s => s.options[s.selectedIndex].textContent.trim();
  const rows = t => [...document.querySelectorAll(`#${t} tbody > tr[id^="${t}-"]`)].filter(r => !r.id.endsWith('-0'))
    .map(r => [...r.querySelectorAll('select')].map(txt).concat([...r.querySelectorAll('input:not([type=hidden])')].map(i => i.value)));
  return { cat: txt(document.getElementById('Applying_for_flight_crew')), nat: txt(document.getElementById('Nationality')),
    radios: ['AppluForMsgForCPLandATPLNO', 'is_govt_employeeNO', 'DefenceNO', 'Have_you_studied_abroadNO', 'additionaldocNO'].map(i => document.getElementById(i).checked),
    edu: rows('educationwith12'), sub: rows('subject1') };
});
console.log(JSON.stringify(fl, null, 1));
check(fl.cat === 'CPL' && fl.nat === 'INDIA' && fl.radios.every(Boolean), 'CPL, INDIA and all NO answers set');
check(fl.edu.length === 2 && fl.edu[0].includes('Kerala Board of Public Examination') && fl.edu[0].includes('60.76') && fl.edu[1].includes('10+2 with PM') && fl.edu[1].includes('66'), 'education rows (row 2 added)');
check(fl.sub.length === 3 && fl.sub[2][0] === 'English' && fl.sub.every(r => r[1] === 'Kerala Board of Higher Secondary Education' && r[4] === '64'), 'subject rows Maths/Physics/English, HSE, pass 64 (row 3 added)');
await shot('6-flight.png'); await pp.screenshot({ path: path.join(SHOTS, '6-flight-page.png'), fullPage: true });

// documents
await pp.goto('https://pariksha.dgca.gov.in/Form/Document');
await panel.waitForFunction(() => document.querySelector('.page-now')?.textContent.includes('Documents'));
await panel.click('[data-act=attach]');
await panel.waitForFunction(() => document.querySelector('.report h3'), null, { timeout: 60000 });
const docs = await pp.evaluate(() => [...Array(11)].map((_, i) => {
  const inp = document.getElementById(`DocumentTable-${i + 1}uploadfile`), tr = inp.closest('tr');
  const num = tr.querySelector('input[placeholder="Document Number"]');
  return [inp.files[0] && inp.files[0].name, inp.files[0] && Math.round(inp.files[0].size / 1024), num ? num.value : null];
}));
console.log(docs);
check(docs.every(d => d[0]), 'all 11 upload boxes have a file');
check(docs[5][2] === 'BVC already in DGCA' && docs[7][2] === 'BVC already in DGCA' && docs[2][2] === '', 'BVC document numbers filled, others empty');
await shot('6-documents.png'); await pp.screenshot({ path: path.join(SHOTS, '6-documents-page.png'), fullPage: true });

// Done wipes everything
await panel.bringToFront();
await panel.click('#btnDone');
await panel.waitForTimeout(500);
const left = await stored();
check(!left.cn && !left.cnImg, 'Done wiped the student from session storage');

console.log('errors:', errors);
check(!errors.length, 'no page errors');
await ctx.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
