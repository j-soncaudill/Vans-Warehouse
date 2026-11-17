"""Small hard hat stickers on one 4x3 in label, as vector PDFs (sharp QR modules).

usage: python3 make-small-stickers.py qr-m.json out_dir

qr-m.json: the QR matrix for https://floorcast.pages.dev/safety/ at error
correction M (29 x 29), rows of "0"/"1". Fewer, bigger modules than level H,
so the code still scans when it's under an inch wide.
"""
import json
import sys

from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

qr_path, out_dir = sys.argv[1:3]
rows = json.load(open(qr_path))
N = len(rows)
W, H = 4 * inch, 3 * inch

# Inter Bold for the caption, if the system has it (as a TTF); Helvetica otherwise.
FONT = "Helvetica-Bold"
for path in ("/usr/share/fonts/truetype/inter/Inter-Bold.ttf",):
    try:
        pdfmetrics.registerFont(TTFont("InterBold", path))
        FONT = "InterBold"
    except Exception:
        pass


# Thermal label printers are 203 dpi. Each module is a whole number of printer
# dots and starts on a dot, so no module comes out a dot wider than its neighbor.
DOT = inch / 203


def snap(v):
    return round(v / DOT) * DOT


def draw_qr(c, x, y, size):
    """QR with its bottom-left corner at (x, y); y grows upward in PDF."""
    m = max(1, round(size / N / DOT)) * DOT
    x, y = snap(x), snap(y)
    for r, row in enumerate(rows):
        for col, bit in enumerate(row):
            if bit == "1":
                c.rect(x + col * m, y + (N - 1 - r) * m, m, m, stroke=0, fill=1)


def cut_grid(c, cols, rows_):
    c.setLineWidth(0.6)
    c.setDash(3, 2.5)
    cw, ch = W / cols, H / rows_
    for i in range(1, cols):
        c.line(i * cw, 0, i * cw, H)
    for j in range(1, rows_):
        c.line(0, j * ch, W, j * ch)
    c.setDash()


def sheet(name, cols, rows_, qr_in, caption, pt):
    c = canvas.Canvas(f"{out_dir}/{name}.pdf", pagesize=(W, H))
    c.setTitle("Safety manual QR stickers")
    cw, ch = W / cols, H / rows_
    q = qr_in * inch
    gap = 0.05 * inch
    block = q + gap + pt * 0.75  # QR, gap, caption height
    for i in range(cols):
        for j in range(rows_):
            cx = i * cw + cw / 2
            bottom = j * ch + (ch - block) / 2
            c.setFillColorRGB(0, 0, 0)
            c.setFont(FONT, pt)
            c.drawCentredString(cx, bottom, caption)
            draw_qr(c, cx - q / 2, bottom + pt * 0.75 + gap, q)
    cut_grid(c, cols, rows_)
    c.showPage()
    c.save()
    print("wrote", name)


# 6 per label: each sticker 1.33 x 1.5 in, QR 1.0 in.
sheet("safety-qr-stickers-6-up", 3, 2, 1.0, "SAFETY MANUAL", 8)
# 12 per label: each sticker 1 x 1 in, QR 0.75 in.
sheet("safety-qr-stickers-12-up", 4, 3, 0.75, "SAFETY MANUAL", 6)
