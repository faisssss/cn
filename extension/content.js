// CN Desk – runs inside pariksha.dgca.gov.in pages. Fills fields when the side panel asks.
// It never presses Submit / Save / Save and Next / Login.
(() => {
  if (window.__cnDesk) return; window.__cnDesk = true;

  const PAGES = [
    [/^\/(welcome\.jsp)?$/i, 'welcome'],
    [/^\/home/i, 'home'],
    [/^\/Form\/Terms_and_Conditions/i, 'terms'],
    [/^\/Form\/regwithdigi/i, 'digichoice'],
    [/^\/Form\/New_Candidate_Registration_For_Flight_Crew/i, 'register'],
    [/^\/login/i, 'login'],
    [/^\/digilocker\.jsp/i, 'digiskip'],
    [/^\/Form\/Personal_Details_of_Flight_Crew/i, 'personal'],
    [/^\/Form\/Flight_Crew_Details/i, 'flight'],
    [/^\/Form\/Document/i, 'documents'],
  ];
  const kind = () => (PAGES.find(([re]) => re.test(location.pathname)) || [, 'unknown'])[1];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  // ---------- low-level setters that the site's own scripts notice ----------
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  function setText(el, v) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v == null ? '' : String(v));
    fire(el, 'input'); fire(el, 'change'); fire(el, 'keyup'); fire(el, 'blur');
  }
  function findOption(sel, text) {
    const t = norm(text);
    const opts = [...sel.options];
    return opts.find(o => norm(o.textContent) === t) || opts.find(o => norm(o.value) === t)
      || opts.find(o => norm(o.textContent).startsWith(t)) || null;
  }
  async function setSelect(sel, text, waitMs = 4000) {
    let opt = findOption(sel, text);
    const until = Date.now() + waitMs;
    while (!opt && Date.now() < until) { await sleep(200); opt = findOption(sel, text); }
    if (!opt) return false;
    if (sel.value !== opt.value) { sel.value = opt.value; fire(sel, 'change'); fire(sel, 'input'); }
    return true;
  }
  const selText = sel => sel && sel.selectedIndex >= 0 ? norm(sel.options[sel.selectedIndex].textContent) : '';
  function clickRadio(el) { if (el && !el.checked) el.click(); return !!el; }

  // ---------- result bookkeeping + outlines ----------
  function makeReport() {
    const r = { filled: [], failed: [], checks: [], notes: [] };
    r.ok = (label, el) => { r.filled.push(label); mark(el, '#16a34a'); };
    r.bad = (label, why, el) => { r.failed.push({ label, why }); mark(el, '#f59e0b'); };
    return r;
  }
  function mark(el, color) {
    if (!el) return;
    const target = el.matches('select.select2-hidden-accessible') ? el.nextElementSibling || el : el;
    target.style.outline = `3px solid ${color}`; target.style.outlineOffset = '1px';
  }
  const clean = r => ({ filled: r.filled, failed: r.failed, checks: r.checks, notes: r.notes });

  async function fillText(r, id, value, label) {
    const el = document.getElementById(id);
    if (!el) return r.bad(label, 'field not found');
    if (el.disabled || el.readOnly) return r.bad(label, 'field is locked', el);
    setText(el, value);
    await sleep(60);
    if (norm(el.value) !== norm(value)) return r.bad(label, `site changed it to "${el.value}"`, el);
    r.ok(label, el);
  }
  async function fillSelect(r, sel, text, label) {
    if (!sel) return r.bad(label, 'field not found');
    if (sel.disabled) return r.bad(label, 'field is locked', sel);
    (await setSelect(sel, text)) ? r.ok(label, sel) : r.bad(label, `option "${text}" not found – choose it by hand`, sel);
  }
  async function fillRadio(r, idBase, yesNo, label) {
    const el = document.getElementById(idBase + yesNo);
    if (!el) return r.bad(label, 'option not found');
    clickRadio(el); await sleep(150);
    el.checked ? r.ok(label, el.parentElement || el) : r.bad(label, 'could not tick', el);
  }

  // ---------- pages ----------
  async function fillRegister(d) {
    const r = makeReport();
    await fillSelect(r, $('#Title'), d.title, 'Title');
    await fillText(r, 'First_Name', d.firstName, 'First name');
    await fillText(r, 'Middle_Name', d.middleName, 'Middle name');
    await fillText(r, 'Last_Name', d.lastName, 'Last name');
    await fillText(r, 'Mother_s_Name', d.mother, "Mother's name");
    await fillText(r, 'Father_s_Name', d.father, "Father's name");
    await fillText(r, 'Date_of_birth', d.dob, 'Date of birth');
    $('.datepicker.dropdown-menu') && ($('.datepicker.dropdown-menu').style.display = 'none');
    await fillSelect(r, $('#Gender'), d.gender, 'Gender');
    await fillText(r, 'AadharNo', d.aadhaar, 'Aadhaar');
    await fillText(r, 'Mobile_Number', d.mobile, 'Mobile');
    await fillText(r, 'Confirm_Mobile_Number', d.mobile, 'Confirm mobile');
    await fillText(r, 'Email_ID', d.email, 'Email');
    await fillText(r, 'Confirm_Email_ID', d.email, 'Confirm email');
    const cb = $('#note_new_candidate_reg');
    if (cb) { if (!cb.checked) cb.click(); cb.checked ? r.ok('1.15 never registered (ticked)', cb) : r.bad('1.15 never registered', 'could not tick', cb); }
    else r.bad('1.15 never registered', 'checkbox not found');
    const cap = $('#Captcha');
    if (cap) { cap.scrollIntoView({ block: 'center' }); cap.focus(); mark(cap, '#2563eb'); r.notes.push('Type the CAPTCHA, check everything, then press Submit.'); }
    return clean(r);
  }

  async function fillPersonal(d, opt) {
    const r = makeReport();
    // greyed fields: compare only
    const cmp = [['First_Name', d.firstName, 'First name'], ['Middle_Name', d.middleName, 'Middle name'],
      ['Last_Name', d.lastName, 'Last name'], ['Mother_s_Name', d.mother, "Mother's name"],
      ['Father_s_Name', d.father, "Father's name"], ['Date_of_birth', d.dob, 'Date of birth'],
      ['Mobile_Number', d.mobile, 'Mobile'], ['Email_ID', d.email, 'Email'], ['AadharNo', d.aadhaar, 'Aadhaar']];
    for (const [id, want, label] of cmp) {
      const el = document.getElementById(id); if (!el) continue;
      const same = norm(el.value) === norm(want);
      r.checks.push({ label, onSite: el.value, ours: want || '', same });
      mark(el, same ? '#16a34a' : '#dc2626');
    }
    await fillText(r, 'Address_Line_1', d.addr1, 'Address line 1');
    await fillText(r, 'Address_Line_2', d.addr2, 'Address line 2');
    await fillText(r, 'Address_Line_3', d.addr3, 'Address line 3');
    await fillText(r, 'city', d.city, 'Village/Town/City');
    await fillSelect(r, $('#Country'), d.country || 'India', 'Country');
    await sleep(400);
    await fillSelect(r, $('#State'), d.state || 'Kerala', 'State');
    await fillText(r, 'Pin', d.pin, 'PIN');

    if (opt.sameAddress === 'YES') {
      // site bug: the copy only refreshes on a NO → YES change
      const no = $('#caddresssameaspermanentNO'), yes = $('#caddresssameaspermanentYES');
      if (no && yes) {
        no.click(); await sleep(400); yes.click(); await sleep(700);
        const pairs = [['Address_Line_1', 'p_Address_Line_1'], ['Address_Line_2', 'p_Address_Line_2'], ['Address_Line_3', 'p_Address_Line_3'], ['city', 'p_city'], ['Pin', 'p_Pin']];
        let allSame = true;
        for (const [a, b] of pairs) {
          const A = document.getElementById(a), B = document.getElementById(b);
          if (!A || !B) continue;
          const same = norm(A.value) === norm(B.value); allSame = allSame && same; mark(B, same ? '#16a34a' : '#dc2626');
        }
        for (const [a, b] of [['Country', 'p_Country'], ['State', 'p_State']]) {
          const A = document.getElementById(a), B = document.getElementById(b);
          if (A && B && selText(A) !== selText(B)) { allSame = false; mark(B, '#dc2626'); }
        }
        allSame ? r.ok('Permanent address = correspondence (checked)', yes.parentElement)
          : r.bad('Permanent address', 'right side does not match – click NO then YES by hand', yes.parentElement);
      } else r.bad('Same address YES/NO', 'option not found');
    } else {
      await fillRadio(r, 'caddresssameaspermanent', 'NO', 'Same address: NO');
      r.notes.push('Permanent address left for you to fill (you switched "same address" off).');
    }
    r.notes.push('Check the page, then press Save → OK → Save and Next.');
    return clean(r);
  }

  function visibleTable(ids) {
    const tables = ids.map(id => document.getElementById(id)).filter(Boolean);
    return tables.find(visible) || tables[0] || null;
  }
  function dataRows(table) {
    return $$('tbody > tr', table).filter(tr => /-\d+$/.test(tr.id) && !/-0$/.test(tr.id) && tr.style.display !== 'none');
  }
  async function ensureRows(table, n) {
    for (let tries = 0; dataRows(table).length < n && tries < 5; tries++) {
      const btn = $(`button[onclick*="addrowintable('${table.id}')"]`);
      if (!btn || btn.disabled) break;
      btn.click(); await sleep(400);
    }
    return dataRows(table);
  }
  async function fillRow(r, row, label, selVals, inVals) {
    const sels = $$('select', row), ins = $$('input', row).filter(i => i.type !== 'hidden' && i.type !== 'file');
    for (let i = 0; i < selVals.length; i++) if (selVals[i] != null) { await fillSelect(r, sels[i], selVals[i], `${label}: ${selVals[i]}`); await sleep(150); }
    for (let i = 0; i < inVals.length; i++) if (inVals[i] != null) {
      const el = ins[i];
      if (!el) { r.bad(`${label} column ${i + 1}`, 'field not found'); continue; }
      setText(el, inVals[i]); await sleep(40);
      norm(el.value) === norm(inVals[i]) ? r.ok(`${label}: ${inVals[i] || '(blank)'}`, el) : r.bad(label, `site changed "${inVals[i]}" to "${el.value}"`, el);
    }
  }

  async function fillFlight(d, opt) {
    const r = makeReport();
    await fillSelect(r, $('#Applying_for_flight_crew'), opt.category || 'CPL', 'Registration category');
    await sleep(600);
    await fillSelect(r, $('#Nationality'), opt.nationality || 'INDIA', 'Nationality');
    await fillRadio(r, 'AppluForMsgForCPLandATPL', opt.licence, `Licence from Indian/foreign authority: ${opt.licence}`);
    const aad = $('#AadharNo');
    if (aad && !aad.disabled) { setText(aad, d.aadhaar); r.ok('Aadhaar', aad); }
    await fillRadio(r, 'is_govt_employee', opt.govt, `Govt employee: ${opt.govt}`);
    await fillRadio(r, 'Defence', opt.defence, `Defence pilot: ${opt.defence}`);
    await fillRadio(r, 'Have_you_studied_abroad', opt.abroad, `Foreign university: ${opt.abroad}`);

    const edu = visibleTable(['educationwith12', 'education']);
    if (!edu) r.bad('Education table', 'not found');
    else {
      const rows = await ensureRows(edu, 2);
      if (rows[0]) await fillRow(r, rows[0], '10th', ['10th', 'Kerala Board of Public Examination', d.y10, 'Percentage'],
        ['', '1', String(d.m10obt ?? ''), String(d.m10max ?? ''), d.p10, '']);
      else r.bad('Education 10th row', 'row not found');
      if (rows[1]) await fillRow(r, rows[1], '12th', ['10+2 with PM', 'Kerala Board of Higher Secondary Education', d.y12, 'Percentage'],
        ['', '2', String(d.m12obt ?? ''), String(d.m12max ?? ''), d.p12, '']);
      else r.bad('Education 12th row', 'row not found – press Add Row and fill again');
    }
    const sub = document.getElementById('subject1');
    if (!sub) r.bad('Subject table', 'not found');
    else {
      const rows = await ensureRows(sub, 3);
      const HSE = 'Kerala Board of Higher Secondary Education';
      const subjects = [['Maths', d.maths, d.mathsMax], ['Physics', d.phy, d.phyMax], ['English', d.eng, d.engMax]];
      for (let i = 0; i < 3; i++) {
        if (!rows[i]) { r.bad(`Subject row ${i + 1}`, 'row not found'); continue; }
        const [name, obt, max] = subjects[i];
        await fillRow(r, rows[i], name, [name, HSE], [String(obt ?? ''), String(max ?? 200), '64']);
      }
    }
    await fillRadio(r, 'additionaldoc', opt.additionalDoc, `Additional document: ${opt.additionalDoc}`);
    for (const [k, txt] of [['licence', 'licence details'], ['defence', 'defence details'], ['abroad', 'foreign university details'], ['additionalDoc', 'additional document']]) {
      if (opt[k] === 'YES') r.notes.push(`You chose YES for ${txt} – fill that part by hand.`);
    }
    r.notes.push('Sections 6, 8 and 9 are left blank. Read the final check, then Save and Next (it cannot be edited after).');
    return clean(r);
  }

  const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  // Pariksha: choosing a file opens a preview window (#documentmodel); the file only reaches DGCA after its
  // Upload button, and then the row shows "click to view". So: one slot at a time, wait for each.
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && visible(el);
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); } return null; }
  const rowHasView = tr => !!tr && [...tr.querySelectorAll('a')].some(a => /click to view/i.test(a.title || a.textContent || ''));
  function siteMessage() {
    for (const sel of ['.alertnote', '.stickynote']) {
      const box = $(sel);
      if (shown(box)) { const msg = ($('.msg', box) || box).textContent.trim(); const ok = $('button', box); return { msg, ok }; }
    }
    return null;
  }
  async function attachFiles(files, onlyMissing) {
    const r = makeReport();
    for (const f of files) {
      const input = document.getElementById(`DocumentTable-${f.row}uploadfile`);
      const label = `${f.row}. ${f.title}`;
      if (!input) { r.bad(label, 'upload box not found'); continue; }
      const tr = input.closest('tr');
      if (onlyMissing && rowHasView(tr)) { r.ok(`${label} (already uploaded)`, input); continue; }
      const limit = Number(input.getAttribute('docsize')) || 0;
      if (limit && f.size > limit) { r.bad(label, `file is ${Math.round(f.size / 1024)} KB, site allows ${Math.round(limit / 1024)} KB`, input); continue; }
      if (f.docNumber) {
        const num = tr && $('input[placeholder="Document Number"]', tr);
        if (num) { setText(num, f.docNumber); r.ok(`${f.row}. Document number: ${f.docNumber}`, num); }
        else r.bad(`${f.row}. Document number`, 'box not found');
      }
      const hadView = rowHasView(tr);
      input.scrollIntoView({ block: 'center' });
      const dt = new DataTransfer();
      dt.items.add(new File([b64ToBytes(f.b64)], f.name, { type: f.type }));
      input.files = dt.files;
      fire(input, 'input'); fire(input, 'change');

      // 1) the preview window with its Upload button (or an error message from the site)
      const modal = document.getElementById('documentmodel');
      const opened = await waitFor(() => (shown(modal) && 'modal') || (siteMessage() && 'msg'), 10000);
      if (opened === 'msg') {
        const m = siteMessage(); r.bad(label, `site says: "${m.msg}"`, input); m.ok && m.ok.click(); await sleep(300); continue;
      }
      if (opened === 'modal') {
        await sleep(600);                                   // let the preview load
        const up = document.getElementById('documentmodelupload');
        if (!up) { r.bad(label, 'Upload button not found – press it yourself', input); continue; }
        up.click();
      }
      // 2) wait for the upload to finish: window closed, loading overlay gone
      await waitFor(() => !shown(modal) && !shown(document.getElementById('loader')), 60000);
      await sleep(500);
      const msg = siteMessage();
      if (msg) {
        const good = /success|upload/i.test(msg.msg) && !/error|fail|invalid|not/i.test(msg.msg);
        msg.ok && msg.ok.click(); await sleep(300);
        if (!good) { r.bad(label, `site says: "${msg.msg}"`, input); continue; }
      }
      // 3) "click to view" in the row means DGCA has the file
      const ok = await waitFor(() => rowHasView(input.closest('tr') || tr), 8000);
      if (ok) r.ok(hadView ? `${label} (replaced)` : label, input.closest('tr') ? $('input[type=file]', input.closest('tr')) || input : input);
      else r.bad(label, 'no "click to view" after upload – choose the file and press Upload by hand', input);
    }
    const n = r.filled.filter(x => !/Document number/.test(x)).length;
    r.notes.push(`${n}/${files.length} files uploaded (each shows "click to view"). Spot-check a few, then Save and Next.`);
    return clean(r);
  }

  // ---------- routine clicks ----------
  const byText = (sel, re) => $$(sel).find(e => re.test(e.textContent.trim()) && visible(e));
  function flightCrewLink(re) {
    const links = $$('a').filter(a => re.test(a.textContent.trim()));
    for (const a of links) {
      for (let el = a.parentElement; el && el !== document.body; el = el.parentElement) {
        const t = el.textContent, fc = /FLIGHT CREW/.test(t), ame = /\bAME\b/.test(t);
        if (fc || ame) { if (fc && !ame) return a; break; }
      }
    }
    return links.length === 2 ? links[1] : null;
  }
  function routineTarget(k, stage) {
    if (k === 'welcome') return byText('a,button', /^Click Here To Proceed$/i);
    if (k === 'home') return stage === 'login' ? flightCrewLink(/^Candidate Login$/i) : flightCrewLink(/^NEW Candidate Registration$/i);
    if (k === 'digichoice') return byText('button,a,input[type=button]', /^No$/i);
    if (k === 'digiskip') return byText('button,a,input[type=button]', /^Skip Digilocker step$/i);
    return null;
  }
  async function doRoutine(k, stage) {
    if (k === 'terms') {
      const cb = $$('input[type=checkbox]').find(visible);
      if (!cb) return { done: false, why: 'checkbox not found' };
      if (!cb.checked) cb.click();
      await sleep(300);
      const btn = byText('button,input[type=button],input[type=submit]', /^Submit$/i);
      if (!btn) return { done: false, why: 'Submit not found' };
      btn.click(); return { done: true, what: 'Ticked "I have read…" and pressed Submit' };
    }
    const t = routineTarget(k, stage);
    if (!t) return { done: false, why: 'link/button not found' };
    t.scrollIntoView({ block: 'center' }); mark(t, '#2563eb'); await sleep(500);
    t.click();
    return { done: true, what: `Clicked "${t.textContent.trim()}"` };
  }
  function fillLogin(email) {
    const r = makeReport();
    const el = $$('input').find(i => /email/i.test(i.placeholder || '') || /computer number/i.test(i.placeholder || ''));
    if (!el) { r.bad('Email', 'field not found'); return clean(r); }
    setText(el, email); r.ok('Email', el);
    const pw = $('input[type=password]'); if (pw) { pw.focus(); mark(pw, '#2563eb'); }
    r.notes.push('Type the password and CAPTCHA, then press Login.');
    return clean(r);
  }

  // ---------- messaging ----------
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    (async () => {
      try {
        if (msg.cmd === 'ping') return reply({ kind: kind(), url: location.href });
        if (msg.cmd === 'fill') {
          const k = kind();
          if (k === 'register') return reply(await fillRegister(msg.data));
          if (k === 'personal') return reply(await fillPersonal(msg.data, msg.options));
          if (k === 'flight') return reply(await fillFlight(msg.data, msg.options));
          if (k === 'login') return reply(fillLogin(msg.data.email));
          return reply({ error: 'This page is not one CN Desk fills.' });
        }
        if (msg.cmd === 'attach') return reply(kind() === 'documents' ? await attachFiles(msg.files, msg.onlyMissing) : { error: 'Open the Documents page first.' });
        if (msg.cmd === 'routine') return reply(await doRoutine(kind(), msg.stage));
        reply({ error: 'unknown command' });
      } catch (e) { reply({ error: String(e && e.message || e) }); }
    })();
    return true;
  });

  // tell the panel which page this is (the panel decides whether to do a routine click)
  const announce = () => chrome.runtime.sendMessage({ evt: 'page', kind: kind(), url: location.href }).catch(() => {});
  announce();

  // session-expiry warning
  let warned = false;
  setInterval(() => {
    const p = document.getElementById('sessionpopupdiv');
    const on = !!p && getComputedStyle(p).display !== 'none';
    if (on && !warned) chrome.runtime.sendMessage({ evt: 'session' }).catch(() => {});
    warned = on;
  }, 1500);
})();
