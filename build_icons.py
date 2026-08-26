# -*- coding: utf-8 -*-
"""用宁哥提供的篮球 UP 图标生成 PWA/App 所需的全部图标尺寸,
并更新 manifest.json 的图标列表与主题色。"""
from PIL import Image
import os, json

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\GTX1070\.workbuddy\clipboard-images\clipboard-2026-08-25T11-31-47-711Z-03d5b3ef.png"

img = Image.open(SRC).convert("RGBA")
# 原图 286x280,接近方形; 取中心最大正方形 280x280,让篮球 UP 图案撑满
w, h = img.size
s = min(w, h)
left = (w - s) // 2
top = (h - s) // 2
square = img.crop((left, top, left + s, top + s))

# 提取背景色(取左上角 5x5 平均)作为主题色
sample = square.crop((0, 0, min(5, s), min(5, s))).convert("RGB")
rgb = [int(sum(c[i] for c in sample.getdata()) / len(sample.getdata())) for i in range(3)]
theme = "#" + "".join(f"{c:02x}" for c in rgb)
print("theme_color:", theme)

def make(size, path):
    out = square.resize((size, size), Image.LANCZOS)
    out.save(path, "PNG")
    print("saved", path, size)

make(192, os.path.join(ROOT, "icon.png"))
make(512, os.path.join(ROOT, "icon-512.png"))
make(180, os.path.join(ROOT, "apple-touch-icon.png"))

# favicon.ico 多分辨率 16/32/48
ico = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
for size in [16, 32, 48]:
    im = square.resize((size, size), Image.LANCZOS)
    ico.paste(im, ((64 - size) // 2, (64 - size) // 2))
# 保存为多分辨率 ico; PIL 会自动把不同尺寸放一起
ico.save(os.path.join(ROOT, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("saved favicon.ico")

# 更新 manifest.json
manifest_path = os.path.join(ROOT, "manifest.json")
m = json.load(open(manifest_path, encoding="utf-8"))
m["name"] = "三分训练"
m["short_name"] = "三分训练"
m["theme_color"] = theme
m["background_color"] = theme
m["icons"] = [
    {"src": "icon.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
    {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}
]
json.dump(m, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("manifest.json updated")
