# CN Desk: DGCA Computer Number helper

A small offline tool for applying for DGCA Computer Numbers (Pariksha) for many students.
There is nothing to install and no server. **Double-click `index.html`** to open it in Chrome or Edge.
All data stays in that browser on that PC.

> Keep the whole folder together (`index.html`, `app.js`, `app.css`, `lib/`).

## What it does

| Tab | What it saves you |
|---|---|
| **Students** | Enter each student once: personal details as on the marksheet, address as on Aadhaar, 10th/12th board and register numbers, PCM marks. It works out **PCM %** for you. It also tracks each student's stage (BVC posted → received → applied → rejected / CN received) and moves students waiting more than 30 days to the top. |
| **Students → Copy to Pariksha** | Every portal field in order, each with a **Copy** button. Paste into Pariksha with Ctrl+V. You never retype a name or address. There is an optional CAPITALS mode. |
| **BVC letters** | Pick a student and 10th or 12th. It makes a printable **request letter** from the company, an **authorisation letter** for the student to sign, and an **envelope label**. The correct board address is picked automatically (Kerala / CBSE / CISCE). |
| **Documents** | Load the scan (one multi-page PDF, or images). It assigns pages to the 14 slots in stack order. You can rotate, crop or clean up any page. It writes the **"SL No 3 : UID" label on top in a handwriting font** (or your own handwriting image), resizes and compresses each file to the slot's KB and pixel limits, and names the files `01_Photograph.jpg … 14_Identity_proof.jpg`. **Download ZIP** gives you one folder per student, ready to upload. |
| **Settings** | The 14-slot table (name, label, JPG/PDF, min/max KB, pixel size, reuse, e.g. "Address proof = slot 3 Aadhaar"), board addresses and fees, letter wording, company details, **backup / restore**. |

## First-time setup (15 minutes, once)

1. **Settings → Upload slots.** The default list is a guess. Open the Pariksha upload page once and copy the exact
   slot numbers, names, file type (JPG/PDF) and size limits into the table. For photo and signature, enter the
   exact pixel size if the portal asks for one and tick *Exact size*.
2. **Settings → Boards.** Check each board's BVC address and fee against its current notice (the CBSE regional office
   address especially). Fill in the fee / DD details.
3. **Settings → Company.** Address, phone and signatory for the letters.
4. **Export a backup** every week (Settings → Backup). Clearing browser data deletes everything.

## Recommended workflow per student

1. **Students → + New**. Type details from the marksheet and Aadhaar, and enter the PCM marks.
2. **BVC letters → Generate → Print all** for 10th, then again for 12th. The student signs the authorisation.
   Post by speed post and enter the posted date and tracking number on the student.
3. When the BVCs arrive, enter the received dates. The student then shows *Ready to apply*.
4. **Documents → Print stack-order sheet.** Put the photocopies in that order. The student
   signs "self-attested" on every page **in one sitting**.
5. **Scan the whole stack once, straight to the PC** as one PDF (see below). No phone, no WhatsApp.
6. Drop the PDF into **Documents → Auto-assign → Build all files → Download ZIP**.
7. **Students → Copy to Pariksha** for the form, then upload the 14 files from the ZIP folder.
8. If DGCA rejects it, fix the one wrong thing and rebuild. The student's details are still saved.

## Scanning straight to the PC

A browser page can't drive a scanner, so use one of these and save into a fixed folder:

- **NAPS2** (free, <https://www.naps2.com>). It supports the document feeder, both sides, and saves one PDF per batch. Recommended.
- **HP Smart for Windows** or **HP Scan** on the PC itself (not the phone app). Choose *Save as PDF* into a folder.

Scan at 200–300 dpi, colour. The app compresses the files for you.
