# -*- coding: utf-8 -*-
"""แปลง static/icon-src.png (โลโก้เพชร) เป็นไอคอน PWA ครบชุด"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
SRC = os.path.join(STATIC, "icon-src.png")

if not os.path.isfile(SRC):
    raise SystemExit("ไม่พบ " + SRC + " — เซฟรูปเพชรไว้ที่นี่ก่อน")

im = Image.open(SRC).convert("RGBA")

# ครอปให้เหลือเฉพาะส่วนที่ไม่ใช่พื้นหลัง (auto-trim ขอบ) ถ้ามี alpha หรือพื้นขาว
def trim(img):
    bg = Image.new("RGBA", img.size, (255, 255, 255, 0))
    # ถ้าพื้นเป็นสีขาวทึบ ให้ถือว่าพื้นหลัง
    px = img.load()
    # สร้าง mask: pixel ที่ไม่ขาวและไม่โปร่ง = เนื้อหา
    from PIL import ImageChops
    white = Image.new("RGB", img.size, (255, 255, 255))
    diff = ImageChops.difference(img.convert("RGB"), white)
    bbox = diff.getbbox()
    return img.crop(bbox) if bbox else img

gem = trim(im)

def make(size, pad_ratio, bg, out):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - pad_ratio * 2))
    # สเกลเพชรให้พอดีกรอบ inner (ขยาย/ย่อได้ คงสัดส่วน)
    scale = min(inner / gem.width, inner / gem.height)
    new = (max(1, round(gem.width * scale)), max(1, round(gem.height * scale)))
    g = gem.resize(new, Image.LANCZOS)
    x = (size - g.width) // 2
    y = (size - g.height) // 2
    canvas.alpha_composite(g, (x, y))
    canvas.save(out)
    print("wrote", out, f"({size}px, gem {g.width}x{g.height})")

WHITE = (255, 255, 255, 255)
# "any" — เต็มภาพ พื้นขาว (เหมือนไทล์ไอคอนสะอาด)
make(192, 0.06, WHITE, os.path.join(STATIC, "icon-192.png"))
make(512, 0.06, WHITE, os.path.join(STATIC, "icon-512.png"))
# "maskable" — เว้น safe-zone กันโดนครอปเป็นวงกลม/squircle
make(512, 0.16, WHITE, os.path.join(STATIC, "icon-maskable-512.png"))
print("done")
