"""4x3 in labels (300 dpi, black and white) with the safety manual QR code.

hardhat: two hard-hat stickers per label, each with a dashed cut line.
posted:  one big QR for a gang box, trailer door or office wall.
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

qr_path, logo_path, out_dir = sys.argv[1:4]
DPI = 300
W, H = 4 * DPI, 3 * DPI
rows = json.load(open(qr_path))
N = len(rows)
F = "/usr/share/fonts/opentype/inter/Inter-"


def font(weight, px):
    return ImageFont.truetype(F + weight + ".otf", px)


def qr(module):
    """The QR at a whole number of dots per module, so every module is the same size."""
    im = Image.new("1", (N * module, N * module), 1)
    d = ImageDraw.Draw(im)
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "1":
                d.rectangle([x * module, y * module, (x + 1) * module - 1, (y + 1) * module - 1], fill=0)
    return im


def center_text(d, cx, y, text, f):
    w = d.textlength(text, font=f)
    d.text((cx - w / 2, y), text, font=f, fill=0)


def dashed_round_rect(d, box, r, dash=16, gap=10, width=3):
    """A dashed cut line: solid rounded corners, dashed straight edges."""
    x0, y0, x1, y1 = box
    for a, (cx, cy) in zip((180, 270, 0, 90), ((x0 + r, y0 + r), (x1 - r, y0 + r), (x1 - r, y1 - r), (x0 + r, y1 - r))):
        d.arc([cx - r, cy - r, cx + r, cy + r], a, a + 90, fill=0, width=width)
    step = dash + gap
    for x in range(x0 + r, x1 - r, step):
        e = min(x + dash, x1 - r)
        d.line([(x, y0), (e, y0)], fill=0, width=width)
        d.line([(x, y1), (e, y1)], fill=0, width=width)
    for y in range(y0 + r, y1 - r, step):
        e = min(y + dash, y1 - r)
        d.line([(x0, y), (x0, e)], fill=0, width=width)
        d.line([(x1, y), (x1, e)], fill=0, width=width)


def hardhat():
    im = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(im)
    # Two stickers, 1.65 x 2.15 in, side by side.
    sw, sh = int(1.65 * DPI), int(2.15 * DPI)
    gap = (W - 2 * sw) // 3
    y0 = (H - sh) // 2
    module = 11  # 37 modules x 11 dots = 407 dots = 1.36 in
    code = qr(module)
    for i in range(2):
        x0 = gap + i * (sw + gap)
        dashed_round_rect(d, (x0, y0, x0 + sw, y0 + sh), 36)
        cx = x0 + sw // 2
        center_text(d, cx, y0 + 30, "SAFETY MANUAL", font("Bold", 44))
        qx = cx - code.width // 2
        qy = y0 + 128
        im.paste(code, (qx, qy))
        center_text(d, cx, qy + code.height + 22, "Scan to view", font("SemiBold", 34))
    center_text(d, W // 2, H - 52, "Cut on the dashed lines", font("Regular", 26))
    return im


def posted():
    im = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(im)
    module = 18  # 37 x 18 = 666 dots = 2.22 in
    code = qr(module)
    qx, qy = 60, (H - code.height) // 2
    im.paste(code, (qx, qy))
    tx = qx + code.width + 50
    right = W - 50
    cx = (tx + right) // 2
    logo = Image.open(logo_path).convert("RGBA")
    # The logo is light on dark; print it as solid black.
    alpha = logo.getchannel("A")
    lw = right - tx
    lh = int(alpha.height * lw / alpha.width)
    alpha = alpha.resize((lw, lh), Image.LANCZOS).point(lambda a: 0 if a > 110 else 255).convert("1")
    im.paste(alpha, (tx, 120))
    y = 120 + lh + 40
    for line, f in (("FIELD SAFETY", font("Bold", 50)), ("MANUAL", font("Bold", 50))):
        center_text(d, cx, y, line, f)
        y += 62
    y += 30
    for line in ("Scan with a", "phone camera", "to view"):
        center_text(d, cx, y, line, font("Medium", 34))
        y += 44
    return im


for name, im in (("hardhat-stickers", hardhat()), ("posted-label", posted())):
    im.save(f"{out_dir}/safety-qr-{name}.png", dpi=(DPI, DPI))
    im.convert("L").save(f"{out_dir}/safety-qr-{name}.pdf", resolution=DPI)
    print("wrote", name)
