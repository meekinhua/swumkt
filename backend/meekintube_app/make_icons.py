# -*- coding: utf-8 -*-
"""สร้างไอคอน PWA: ปุ่มเล่นเพชรสีแดง (แบรนด์ meekinTube) บนพื้นเข้ม"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(OUT, exist_ok=True)

BG = (15, 15, 15, 255)
RED = (255, 0, 51, 255)
RED_D = (196, 0, 40, 255)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def make(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22)
    # พื้นมุมโค้งเข้ม
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    # เพชรสามเหลี่ยม (ปุ่มเล่น) แบบ low-poly แดงไล่เฉด
    cx, cy = size * 0.52, size * 0.5
    R = size * 0.30
    import math
    pts = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)))
           for a in (-90, 30, 150)]   # สามเหลี่ยมชี้... ปรับเป็นปุ่มเล่น
    # ใช้สามเหลี่ยมชี้ขวา
    p_top = (cx - R * 0.72, cy - R * 0.86)
    p_bot = (cx - R * 0.72, cy + R * 0.86)
    p_right = (cx + R * 0.95, cy)
    center = (cx - R * 0.1, cy)
    facets = [
        ([p_top, p_right, center], RED),
        ([p_bot, p_right, center], RED_D),
        ([p_top, p_bot, center], lerp(RED, RED_D, 0.4)),
    ]
    for poly, col in facets:
        d.polygon(poly, fill=col)
    img.save(path)
    return path


for s in (192, 512):
    print("wrote", make(s, os.path.join(OUT, f"icon-{s}.png")))
print("done")
