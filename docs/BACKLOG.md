# Backlog (parked ideas)

These ideas are on hold until there's time to plan them properly. There's no code for either one yet.

## 1. Check-out station (handheld scanner)

**Goal:** someone scans their own badge, then scans the boxes they're taking. Each box is checked out to them right away, and the record of who took what and when is the same as today.

### Hardware
Use an Android handheld scanner, which has a screen and computer built in, rather than a plain scanner. A plain scanner can't show anyone whether a scan worked.

What to look for:
- Android 11 or newer, with Google Play/Chrome
- a 2D scan engine (reads QR codes)
- a pistol grip
- Wi-Fi
- a charging cradle

Models found (prices as seen; about $400–600 new):

| Model | Price | Notes |
|---|---|---|
| Rayoungtek N77S | ~$429 | grip optional |
| MUNBYN IPDA086 | — | Android 13, has a grip |
| MUNBYN Android 11 (Walmart) | ~$570 | IP65 |
| Zebra TC70/TC75 + trigger handle (refurbished) | ~$498 | |

Buy one first and test it before buying more.

### Design sketch
- **Employee QR badges.** Admins manage and print them, and can cancel or reprint them.
- **Station mode.** It turns on and off with the admin PIN.
- **Flow:**
  - Scan your badge and the screen shows "Hi Dana".
  - Scan each box. It's checked out to you right away, with a beep and a ✓.
  - Scanning a box that's already out shows a red warning and changes nothing.
  - You're signed out after 30 s of no scans, or when you scan your badge again.
- **Database:** this needs a Supabase update that adds an employees table.

### Open questions
- A box that's already out: hand it off to the new person, or only warn?
- Should the station also return boxes to the floor?
- Badge only, or badge + PIN?
- What to build first?

### Rejected options
- **A plain scanner plus a hidden mini-PC.** It gives no feedback to the person scanning.
- **A memory (batch) scanner.** It can't check boxes in real time.

## 2. Mezzanine stock management

**Goal:** track stock on the mezzanine bins and reorder before anything runs out.

- **Bins and items.** Each bin gets a QR label (2″×1″ on the Brother printer).
- **Take.** Scan your badge, then the bin, enter the quantity on a number pad, and tap Take. Attaching a job is optional.
- **Restock (Add)** and **Count**. A count records the difference from what the app expected.
- **Reorder point and quantity per item.** When an item drops below its reorder point:
  - admins get an instant push alert;
  - it's included in the 7 AM summary;
  - it's listed on a Low stock report.
- **Reorder list grouped by vendor.** A "Send order to rep" button opens a pre-filled email (mailto). Free automatic ordering from a vendor isn't possible: punchout and EDI are set up per account.
- **Setup.** Import the item list from a spreadsheet, then walk through a starting count.

### Open questions
- Units: each, or box/case?
- Is a job required when taking stock?
- Who restocks and who counts?
- Does an item list already exist?
- What to build first?
