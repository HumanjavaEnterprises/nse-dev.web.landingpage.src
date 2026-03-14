#!/usr/bin/env python3
"""Generate OG/Twitter card image for nse.dev (1200x630)"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
BG = (10, 10, 15)          # --bg: #0a0a0f
CARD_BG = (18, 18, 26)     # --bg-card: #12121a
CYAN = (34, 211, 238)      # --cyan: #22d3ee
TEXT = (240, 240, 245)      # --text: #f0f0f5
DIM = (136, 136, 160)      # --text-dim: #8888a0
BORDER = (30, 30, 46)      # --border: #1e1e2e

img = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(img)

# Try to load system fonts at various sizes
def load_font(size, bold=False):
    paths = [
        '/System/Library/Fonts/SFNS.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSMono.ttf',
        '/System/Library/Fonts/Menlo.ttc',
    ]
    if bold:
        paths = [
            '/System/Library/Fonts/SFNSMonoBold.ttf',
            '/Library/Fonts/SF-Mono-Bold.otf',
        ] + paths
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

font_title = load_font(64, bold=True)
font_tagline = load_font(26)
font_body = load_font(20)
font_label = load_font(16)
font_badge = load_font(14)

# Subtle border line at bottom
draw.rectangle([(0, H - 3), (W, H)], fill=CYAN)

# "OPEN SOURCE" badge
badge_text = "OPEN SOURCE · NPM + PYPI + CLAWHUB"
bbox = draw.textbbox((0, 0), badge_text, font=font_badge)
bw = bbox[2] - bbox[0] + 24
bh = bbox[3] - bbox[1] + 12
bx = (W - bw) // 2
by = 60
draw.rounded_rectangle([(bx, by), (bx + bw, by + bh)], radius=12, outline=CYAN, width=1)
draw.text((bx + 12, by + 4), badge_text, fill=CYAN, font=font_badge)

# Title "Your Device Is the Enclave"
title = "Your Device Is the Enclave"
bbox = draw.textbbox((0, 0), title, font=font_title)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, 110), title, fill=TEXT, font=font_title)

# Tagline
tagline = "NSE — Nostr Secure Enclave"
bbox = draw.textbbox((0, 0), tagline, font=font_tagline)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, 190), tagline, fill=DIM, font=font_tagline)

# One-liner
line1 = "Identity, wallet, calendar, and relationships —"
line2 = "hardware-protected and sovereign by default."
bbox1 = draw.textbbox((0, 0), line1, font=font_body)
bbox2 = draw.textbbox((0, 0), line2, font=font_body)
draw.text(((W - (bbox1[2] - bbox1[0])) // 2, 250), line1, fill=TEXT, font=font_body)
draw.text(((W - (bbox2[2] - bbox2[0])) // 2, 280), line2, fill=TEXT, font=font_body)

# Four pillar cards
pillars = [
    ("NostrKey", "Identity"),
    ("NostrWalletConnect", "Finance"),
    ("NostrCalendar", "Time"),
    ("NostrSocial", "Relationships"),
]

card_w = 230
card_h = 80
gap = 20
total_w = 4 * card_w + 3 * gap
start_x = (W - total_w) // 2
card_y = 340

for i, (name, label) in enumerate(pillars):
    x = start_x + i * (card_w + gap)
    draw.rounded_rectangle(
        [(x, card_y), (x + card_w, card_y + card_h)],
        radius=8, fill=CARD_BG, outline=BORDER, width=1
    )
    # Name
    bbox = draw.textbbox((0, 0), name, font=font_label)
    nw = bbox[2] - bbox[0]
    draw.text((x + (card_w - nw) // 2, card_y + 16), name, fill=TEXT, font=font_label)
    # Label
    bbox = draw.textbbox((0, 0), label, font=font_badge)
    lw = bbox[2] - bbox[0]
    draw.text((x + (card_w - lw) // 2, card_y + 44), label, fill=CYAN, font=font_badge)

# pip install line
pip_text = "pip install nostrkey nostrwalletconnect nostrcalendar nostrsocial"
bbox = draw.textbbox((0, 0), pip_text, font=font_badge)
pw = bbox[2] - bbox[0]
draw.text(((W - pw) // 2, 460), pip_text, fill=DIM, font=font_badge)

# Footer
footer = "nse.dev  \u00b7  MIT License  \u00b7  A Humanjava project"
bbox = draw.textbbox((0, 0), footer, font=font_badge)
fw = bbox[2] - bbox[0]
draw.text(((W - fw) // 2, H - 40), footer, fill=DIM, font=font_badge)

# Save
out = os.path.join(os.path.dirname(__file__), 'docs', 'og-image.png')
img.save(out, 'PNG', optimize=True)
print(f"Saved: {out} ({os.path.getsize(out)} bytes)")
