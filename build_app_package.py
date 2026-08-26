# -*- coding: utf-8 -*-
"""打包完整的 PWA App 安装包（可安装到手机主屏幕，离线运行，带自定义篮球 UP 图标）。
包含：完整 PWA 文件 + standalone 单文件版。"""
import os, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_ZIP = os.path.join(ROOT, "three-point-trainer-app.zip")

# 先确保单文件版已生成（standalone 目录）
DIST = os.path.join(ROOT, "dist")
if not os.path.exists(os.path.join(DIST, "three-point-trainer.html")):
    raise FileNotFoundError("请先运行 build_standalone.py 生成 dist/three-point-trainer.html")

readme_root = """三分训练 App · 安装包
====================

本压缩包包含两种使用方式，任选其一：

【方式一：PWA 安装到主屏幕（推荐，体验最接近原生 App）】
文件夹：根目录的 PWA 文件
- 把所有文件原样传到手机任意文件夹（如手机存储/three-point-trainer/）。
- 在手机上起一个本地静态服务器：
  · Android：安装「Simple HTTP Server」或「KWS」等 App，选择该文件夹，端口 8080。
  · iOS：可用「Documents by Readdle」「FileBrowser」等带 Web Server 的 App；或用电脑开热点，把文件放在电脑上用 python -m http.server 起服务，手机同 WiFi 访问电脑 IP。
- 用 Chrome(Android) 或 Safari(iOS) 访问本地地址，例如 http://127.0.0.1:8080。
- 安装：
  · Android Chrome：底部/右上角会弹出「安装 三分训练」，或在菜单里点「安装应用 / 添加到主屏幕」。
  · iOS Safari：底部「分享」→「添加到主屏幕」。
- 安装后桌面上会出现篮球 UP 图标，打开就是全屏 App，断网也能用（Service Worker 会缓存所有资源）。

【方式二：单文件直开（最简单，不装服务器）】
文件夹：standalone/
- 直接用「文件」App 或微信打开 three-point-trainer.html，手机浏览器就会加载。
- 数据存在 localStorage，断网可用。
- 部分浏览器(iOS)可能不支持把文件版「添加到主屏幕」；若想要图标，优先用方式一。

【数据备份】
- 所有记录存在本地，不会上传服务器。
- 如需换手机/换浏览器，用「概览」页导出 CSV 备份。
- 清理浏览器缓存或卸载浏览器会清空数据。

主题色：#3100f7（蓝色）
"""

with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    # PWA 根文件
    pwa_files = [
        "index.html", "app.js", "style.css", "manifest.json", "sw.js",
        "icon.png", "icon-512.png", "apple-touch-icon.png", "favicon.ico",
        "today_data.csv", "seed.html"
    ]
    for f in pwa_files:
        src = os.path.join(ROOT, f)
        if os.path.exists(src):
            z.write(src, f)
    # 根说明
    z.writestr("使用说明.txt", readme_root)
    # standalone 子目录
    z.write(os.path.join(DIST, "three-point-trainer.html"), "standalone/three-point-trainer.html")
    z.write(os.path.join(DIST, "使用说明.txt"), "standalone/使用说明.txt")
    if os.path.exists(os.path.join(ROOT, "today_data.csv")):
        z.write(os.path.join(ROOT, "today_data.csv"), "standalone/today_data.csv")

# 6) 另将完整 PWA 静态文件同步进 dist/，便于直接用 Cloudflare Pages 拖拽上传 dist/
import shutil
pwa_dist = [
    "index.html", "app.js", "style.css", "manifest.json", "sw.js",
    "icon.png", "icon-512.png", "apple-touch-icon.png", "favicon.ico",
]
for f in pwa_dist:
    src = os.path.join(ROOT, f)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(DIST, f))
print("dist files:", sorted(os.listdir(DIST)))

print("app zip bytes:", os.path.getsize(OUT_ZIP))
print("DONE")
