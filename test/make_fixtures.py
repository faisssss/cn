"""Builds test copies of the Pariksha pages from 'Save as… Webpage' files.

Real personal details are replaced with fake ones, the site's own scripts are
removed and a small shim (shim.js) plus jQuery/select2 stand in for them.
Usage: python3 test/make_fixtures.py <dir with saved pages>
"""
import re, sys, os, pathlib

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(__file__).parent / 'fixtures'
FAKE = [
    ('fathimasherinpp1@gmail.com', 'test.student@example.com'), ('FATHIMA', 'ANITA'), ('SHERIN', 'ROSE'),
    ('AMEERA K M', 'MARY T K'), ('SAHEER P P', 'THOMAS K J'), ('7736718656', '9000000001'),
    ('786589199914', '999941057058'), ('PALAYULLA PARAMBATH', 'TEST HOUSE'),
    ('PUDUPPANAM PO, VATAKARA, PALAYAD', 'TEST ROAD, TEST TOWN'), ('PO PUDUPPANAM', 'TEST PO'),
    ('KOZHIKODE', 'ERNAKULAM'), ('673015', '682001'), ('08-04-2007', '01-01-2007'),
]
PAGES = {
    'register.html': 'DGCA_Pariksha_new_candidate_registration.html',
    'personal.html': 'DGCA_Pariksha.html',
    'flight.html': 'DGCA_Pariksha1.html',
    'documents.html': 'DGCA_Pariksha2.html',
}
TAIL = '''
<link rel="stylesheet" href="/vendor/select2.min.css">
<script src="/vendor/jquery.min.js"></script>
<script src="/vendor/select2.full.min.js"></script>
<script src="/shim.js"></script>
</body>'''

def find(name):
    for p in SRC.iterdir():
        if p.name.endswith(name): return p
    raise SystemExit('missing ' + name)

for out, name in PAGES.items():
    s = find(name).read_text(encoding='utf8')
    for a, b in FAKE: s = s.replace(a, b)
    s = re.sub(r'<script\b[^>]*>.*?</script>', '', s, flags=re.S | re.I)
    s = re.sub(r'<link\b[^>]*_files/[^>]*>', '', s, flags=re.I)
    s = re.sub(r'(src|href)="\./[^"]*_files/[^"]*"', r'\1=""', s)
    s = s.replace('</body>', TAIL)
    leftover = [w for w in ('FATHIMA', 'SHERIN', 'AMEERA', 'SAHEER', '7736718656', 'gmail') if w in s]
    assert not leftover, (out, leftover)
    (OUT / out).write_text(s, encoding='utf8')
    print('wrote', out, len(s))
