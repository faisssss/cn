// Stand-in for the Pariksha site scripts in test copies of the pages.
/* global $ */
window.formcondition = () => true;
window.PostForm = (...a) => { window.__posted = a; return false; };
['removerowintable','okconfirmpopupdiv','closeconfirmpopupdiv','sessionlogout','sessionlogin','stickynoteclose',
 'selectotherblockadd','selectotherblockcancel','alertnoteclose','togglemenushow','showsubmenu','hidesubmenu',
 'refreshImageCaptcha','showotherdialogue','take_snapshot','cameramodelcancel','SaveSnap','logout'].forEach(f => { window[f] = () => {}; });
window.addrowintable = id => {
  const tpl = document.getElementById(id + '-0'); if (!tpl) return;
  const n = document.querySelectorAll(`#${id} tbody > tr[id^="${id}-"]`).length;
  const row = tpl.cloneNode(true); row.id = `${id}-${n}`; row.style.display = ''; row.classList.remove('editableaddrow');
  row.querySelectorAll('[disabled]').forEach(e => e.removeAttribute('disabled'));
  const rows = [...document.querySelectorAll(`#${id} tbody > tr[id^="${id}-"]`)].filter(r => r.id !== id + '-0');
  (rows[rows.length - 1] || tpl).after(row);
};
document.querySelectorAll('button[disabled]').forEach(b => b.removeAttribute('disabled'));
const page = location.pathname;
if (/Flight_Crew_Details/.test(page)) {
  // start empty, with one education row and two subject rows, so "Add Row" is exercised
  for (const t of ['educationwith12', 'education', 'subject1']) {
    document.querySelectorAll(`#${t} tbody > tr[id^="${t}-"]`).forEach(r => {
      if (r.id === t + '-0') return;
      r.querySelectorAll('input:not([type=hidden])').forEach(i => { i.value = ''; i.removeAttribute('value'); i.disabled = false; });
      r.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; s.disabled = false; });
    });
  }
  document.getElementById('educationwith12-2')?.remove();
  document.getElementById('subject1-3')?.remove();
  for (const id of ['Applying_for_flight_crew', 'Nationality']) { const s = document.getElementById(id); s.selectedIndex = 0; }
  document.querySelectorAll('input[type=radio]').forEach(r => { r.checked = false; });
  document.getElementById('AadharNo').value = '';
  document.getElementById('education').closest('[groupname]').style.display = 'none';
}
if (/Personal_Details/.test(page)) {
  for (const id of ['Address_Line_1','Address_Line_2','Address_Line_3','city','Pin','p_Address_Line_1','p_Address_Line_2','p_Address_Line_3','p_city','p_Pin']) document.getElementById(id).value = '';
  document.getElementById('caddresssameaspermanentYES').checked = true;     // already YES, like the real page
  // real-site bug: the copy happens only when YES is newly chosen
  document.getElementById('caddresssameaspermanentYES').addEventListener('change', () => {
    for (const id of ['Address_Line_1','Address_Line_2','Address_Line_3','city','Pin']) document.getElementById('p_' + id).value = document.getElementById(id).value;
    for (const id of ['Country','State']) { $('#p_' + id).val($('#' + id).val()).trigger('change'); }
  });
}
$('.select2').select2();
