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


def cut_grid(c, cols, rows_, edge):
    c.setLineWidth(0.6)
    c.setDash(3, 2.5)
    cw, ch = (W - 2 * edge) / cols, (H - 2 * edge) / rows_
    for i in range(1, cols):
        c.line(edge + i * cw, 0, edge + i * cw, H)
    for j in range(1, rows_):
        c.line(0, edge + j * ch, W, edge + j * ch)
    c.setDash()


LOGO = f"{__import__('os').path.dirname(__file__) or '.'}/vans-logo-black.png"
LOGO_RATIO = 280 / 696  # height / width


def logo_at_dots(width_dots):
    """The logo as solid black and white at exactly the printer's dots: no gray
    edges for the printer to speckle when it shades them."""
    from PIL import Image
    from reportlab.lib.utils import ImageReader

    im = Image.open(LOGO).convert("L")
    h = round(width_dots * LOGO_RATIO)
    small = im.resize((width_dots, h), Image.LANCZOS).point(lambda v: 0 if v < 140 else 255)
    return ImageReader(small.convert("RGB")), h


def sheet(name, cols, rows_, qr_in, logo_in, pt, edge_in):
    """Each sticker: the QR, then a row with the Van's logo and SAFETY / MANUAL beside it."""
    c = canvas.Canvas(f"{out_dir}/{name}.pdf", pagesize=(W, H))
    c.setTitle("Safety manual QR stickers")
    # Nothing within edge_in of the label's edges: the printer can shift and clip it.
    edge = edge_in * inch
    cw, ch = (W - 2 * edge) / cols, (H - 2 * edge) / rows_
    q = max(1, round(qr_in * inch / N / DOT)) * DOT * N  # the QR's real size once snapped to dots
    logo, logo_h = logo_at_dots(round(logo_in * inch / DOT))
    lw, lh = round(logo_in * inch / DOT) * DOT, logo_h * DOT
    gap = 0.04 * inch
    c.setFont(FONT, pt)
    text_w = max(c.stringWidth(s, FONT, pt) for s in ("SAFETY", "MANUAL"))
    row_w = lw + gap + text_w
    block = q + gap + lh
    for i in range(cols):
        for j in range(rows_):
            cx = edge + i * cw + cw / 2
            bottom = edge + j * ch + (ch - block) / 2
            c.setFillColorRGB(0, 0, 0)
            left = cx - row_w / 2
            c.drawImage(logo, snap(left), snap(bottom), lw, lh)
            # Two short lines, centered on the logo's height.
            tx = left + lw + gap
            mid = bottom + lh / 2
            c.drawString(tx, mid + pt * 0.12, "SAFETY")
            c.drawString(tx, mid - pt * 0.85, "MANUAL")
            draw_qr(c, cx - q / 2, bottom + lh + gap, q)
    cut_grid(c, cols, rows_, edge)
    c.showPage()
    c.save()
    print("wrote", name)


# 6 per label: each sticker about 1.25 x 1.38 in, QR 0.86 in.
sheet("safety-qr-stickers-6-up", 3, 2, 0.86, 0.6, 8.5, 0.12)
# 12 per label: each sticker about 0.95 x 0.93 in, QR 0.71 in.
sheet("safety-qr-stickers-12-up", 4, 3, 0.72, 0.3, 4.8, 0.1)
