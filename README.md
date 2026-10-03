# CN Desk – DGCA Pariksha helper (Chrome extension)

CN Desk opens as a side panel in Chrome next to Pariksha. For one student at a time it:

1. **Start** – takes mobile, email, gender, the studio photo (auto-cropped to 631×645, face ≈ 70%, under 195 KB) and the two final BVC files (used exactly as given).
2. **Scan** – takes the 5-page scanned stack (signature, 10th pass certificate, 10th marksheet, 12th certificate, Aadhaar) as one PDF or one file per document; straightens, trims and whitens each page and warns about blurry/dark scans.
3. **Read** – prepares a PDF and an instruction for Claude chat; you paste Claude's answer back.
4. **Review** – shows every value, splits name and address, calculates percentages (cut off at 2 decimals), and flags mismatches (name, father's/mother's name, DOB), bad Aadhaar check digit, marks over maximum, etc. Fixed answers (CPL, the NOs, same address) can be switched per student.
5. **Labels & files** – places your handwritten "Sl. No" labels (drag, resize, ✕ to remove) and builds all files under the Pariksha limits (photo ≤195 KB JPG, signature ≤70 KB JPG, documents ≤500 KB PDF).
6. **Pariksha** – does the routine clicks, fills the registration form, login email, personal details (with the NO→YES address fix), flight crew details (education + subjects) and attaches all 11 files with "BVC already in DGCA" in the two BVC boxes.

It **never** presses Submit, Save, Save and Next, Login or final submit, never types CAPTCHAs or passwords, and **saves nothing about students**: details live in memory only and are wiped by **Done** or by closing Chrome.

## Install on each PC (once)

1. Download this repository as a ZIP (green **Code** button → **Download ZIP**) and unzip it somewhere permanent, e.g. `Documents\CN Desk`.
2. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Click the puzzle-piece icon in the toolbar and pin **CN Desk**. Clicking it opens the side panel.

To update: replace the folder with the new version and press the ↻ reload button on the CN Desk card in `chrome://extensions`.

## Scanning

HP app → Scan → load the stack in the **document feeder** (printed side up, top edge first) → Source **Document Feeder**, Preset **Document**, Color, 300 dpi → Scan → Save as **PDF**. Drag the PDF onto the panel's Scan step. Documents can also be uploaded one by one.

## For developers

- `extension/` – the extension (Manifest V3). `extract.js` (name/address/percent/checks), `imaging.js` (scan clean-up, photo crop, PDFs), `content.js` (runs on Pariksha pages), `panel.*` (side panel).
- `test/make_fixtures.py` – turns pages saved from Pariksha into test copies with the personal details replaced.
- `test/make_testdocs.py` – makes fake scans/BVCs; `test/e2e.mjs` – runs a fake student through every step in Chromium (needs Playwright):
  `python3 test/make_testdocs.py /tmp/td && cp some-face.png /tmp/td/photo.png && node test/e2e.mjs /tmp/td /tmp/shots`
