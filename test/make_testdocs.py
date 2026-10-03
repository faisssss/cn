"""Fake scanned stack + BVC PDFs for test/e2e.mjs (no real data). Usage: python3 test/make_testdocs.py <outdir>"""
import sys, os, math
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda s: ImageFont.truetype(F, s)
W, H = 2480, 3508
def page(title, lines, rot=0, border=True, sign=False, card=False):
    im = Image.new('RGB', (W, H), (236, 234, 228)); d = ImageDraw.Draw(im)
    if card:
        d.rectangle([250, 500, 2230, 1150], outline=(40, 40, 40), width=6)
        d.text((300, 560), 'Government of India   (TEST CARD)', font=font(60), fill=(20, 20, 20))
        for i, l in enumerate(lines): d.text((300, 680 + i * 90), l, font=font(55), fill=(25, 25, 25))
        d.text((300, 1250), 'Self attested', font=font(70), fill=(20, 40, 120)); d.line([(300, 1400), (700, 1360), (800, 1420)], fill=(20, 40, 120), width=8)
    elif sign:
        d.line([(900 + i * 40, 1600 + int(120 * math.sin(i / 2))) for i in range(25)], fill=(15, 30, 110), width=10)
    else:
        d.text((300, 300), title, font=font(80), fill=(10, 10, 10))
        for i, l in enumerate(lines): d.text((300, 550 + i * 110), l, font=font(60), fill=(30, 30, 30))
        for i in range(18): d.text((300, 1600 + i * 80), 'Lorem ipsum certificate text line %d ............' % i, font=font(45), fill=(60, 60, 60))
    if rot: im = im.rotate(rot, expand=False, fillcolor=(236, 234, 228))
    if border:
        d = ImageDraw.Draw(im); d.rectangle([0, 0, W, 60], fill=(20, 20, 20)); d.rectangle([0, 0, 50, H], fill=(25, 25, 25))
    return im.resize((1240, 1754))
pages = [page('', [], sign=True),
         page('SSLC CERTIFICATE (TEST)', ['Name: ANITA ROSE K', 'Father: THOMAS K J', 'Mother: MARY T K', 'Date of birth: 01/01/2007', 'Year: March 2023'], rot=1.5),
         page('SSLC MARKSHEET (TEST)', ['Name: ANITA ROSE K', 'Total: 395 / 650']),
         page('HIGHER SECONDARY (TEST)', ['Name: ANITA ROSE K', 'Physics 120/200  Maths 108/200', 'English 141/200   Total 792/1200'], rot=-1),
         page('', ['ANITA ROSE K', 'DOB: 01/01/2007  FEMALE', 'TEST HOUSE, TEST ROAD, ERNAKULAM 682001'], card=True, border=False)]
pages[0].save(os.path.join(OUT, 'stack.pdf'), save_all=True, append_images=pages[1:], resolution=150)
for k in ('bvc10', 'bvc12'):
    page('BVC (TEST) ' + k, ['Verified'], border=False).save(os.path.join(OUT, k + '.pdf'), save_all=True,
        append_images=[page('Board verified copy (TEST)', ['seal'], border=False)], resolution=150)
print('written to', OUT)
