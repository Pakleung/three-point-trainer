# -*- coding: utf-8 -*-
"""构建单文件离线版三分训练 App：把 index.html + style.css + app.js 内联成一个
自包含的 HTML，去掉 Service Worker / manifest 引用，图标以内联 data URI 方式保留，
存储走 localStorage。手机浏览器直接打开即可，断网可用、数据存本地。"""
import os, io, zipfile, base64

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
css = open(os.path.join(ROOT, "style.css"), encoding="utf-8").read()
js = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()

# 1) 去掉 Service Worker 注册块（单文件直开时无法注册，且没必要）
js = js.split("/* 注册 Service Worker")[0].rstrip() + "\n"

# 2) CSS 内联
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")

# 3) 图标以内联 data URI 保留（这样「添加到主屏幕」能显示篮球 UP 图标）
icon_path = os.path.join(ROOT, "icon.png")
icon_b64 = base64.b64encode(open(icon_path, "rb").read()).decode("ascii")
icon_data = f"data:image/png;base64,{icon_b64}"
html = html.replace('<link rel="manifest" href="manifest.json">\n', "")
html = html.replace('<link rel="apple-touch-icon" href="apple-touch-icon.png">\n',
                    f'<link rel="apple-touch-icon" href="{icon_data}">\n')
html = html.replace('<link rel="icon" href="icon.png">\n',
                    f'<link rel="icon" type="image/png" href="{icon_data}">\n')

# 4) JS 内联
html = html.replace('<script src="app.js?v=2" defer></script>',
                    "<script>\n" + js + "\n</script>")

# 5) 安装引导横幅（仅单文件直开场景）：打开即提示如何「添加到主屏幕」当 App 用，
#    点「知道了」后用 localStorage 记住，下次不再显示。
BANNER = '''
<div id="install-tip" style="display:flex;align-items:center;gap:8px;background:linear-gradient(90deg,#3100f7,#6a3bff);color:#fff;font-size:13px;line-height:1.45;padding:9px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25);">
  <span style="flex:1;">📲 想当 App 用？点浏览器右上角 <b>⋯</b> → <b>添加到主屏幕</b>（或「安装」），以后点图标离线也能玩。</span>
  <button onclick="document.getElementById('install-tip').style.display='none';try{localStorage.setItem('tpt_install_tip','1')}catch(e){}" style="background:rgba(255,255,255,.22);border:none;color:#fff;border-radius:14px;padding:6px 12px;font-size:13px;white-space:nowrap;">知道了</button>
</div>
<script>try{if(localStorage.getItem('tpt_install_tip')==='1'){var t=document.getElementById('install-tip');if(t)t.style.display='none';}}catch(e){}</script>
'''
html = html.replace('<header class="app-header">', '<header class="app-header">\n' + BANNER, 1)

out_html = os.path.join(DIST, "three-point-trainer.html")
open(out_html, "w", encoding="utf-8").write(html)
print("standalone html bytes:", os.path.getsize(out_html))

# 5) 使用说明
readme = """三分训练 App · 离线单文件版
============================

这是一个完全离线、纯本地运行的投篮训练记录工具（三分投篮命中率 / 投失打框热力图）。
所有代码、样式、图表、图标都在这个单独的 HTML 文件里，不依赖任何网络或服务器。

【怎么装到手机】
1. 把这个 three-point-trainer.html 传到手机：
   - 微信发给自己 / 隔空投送(AirDrop) / 数据线拷贝到手机「文件」都行。
2. 用手机浏览器打开它：
   - iOS：在「文件」App 里点开这个 HTML → 右上角「分享」→「在浏览器中打开」（选 Safari）。
   - Android：用「文件管理」找到它 → 用 Chrome 打开即可。
3. 当 App 用（推荐，点图标直接进，离线也能玩）：
   - iOS：在 Safari 打开后 → 底部「分享」按钮 →「添加到主屏幕」→ 桌面出现篮球 UP 图标。
   - Android：用 Chrome 打开后 → 右上角「菜单 ⋮」→「安装应用 / 添加到主屏幕」→ 桌面出现图标。
   - 打开 App 后顶部会有引导条提示这一步；点「知道了」后就不再显示。

【数据存在哪】
- 所有训练记录都存在你手机浏览器本地的 localStorage 里，断网也能用，不会上传到任何服务器。
- 首次打开会自动写入一份示例数据，方便你直接看分析页效果。
- 换手机、或换一个浏览器，数据不互通；重要数据请用「概览」页的「导出」备份成 CSV。

【功能】
- 训练：进球一键记、投失记打框位置（篮筐俯瞰 360° 失误点环）、实时命中率、本次训练热力图。
- 概览：总命中率、各点位、导入 / 导出 CSV。
- 分析：球场热力图点击任意点位可下钻，看该点位历史命中率走势与投失打框热力图。

提示：手机浏览器清理缓存 / 卸载浏览器 会清空本地数据，记得定期导出备份。
"""
open(os.path.join(DIST, "使用说明.txt"), "w", encoding="utf-8").write(readme)

# 6) 使用说明
zip_path = os.path.join(ROOT, "three-point-trainer-phone.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(out_html, "three-point-trainer.html")
    z.write(os.path.join(DIST, "使用说明.txt"), "使用说明.txt")
    if os.path.exists(os.path.join(ROOT, "today_data.csv")):
        z.write(os.path.join(ROOT, "today_data.csv"), "today_data.csv")
print("zip bytes:", os.path.getsize(zip_path))
print("DONE")
