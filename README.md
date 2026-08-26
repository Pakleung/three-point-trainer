# 三分训练（Three-Point Trainer）

一个**纯本地运行的三分投篮训练记录与分析 PWA**：记录每点位命中率、投篮动作、投失打框位置（篮筐俯瞰 360° 失误点热力图），并可离线「添加到主屏幕」当 App 用。所有数据存在你手机本地，**不上传任何服务器**，断网也能用。

> 技术栈：原生 HTML / CSS / JavaScript（无框架、无构建工具）+ Service Worker + Web App Manifest。

---

## 一、部署到手机（两种方式任选）

### 方式一：GitHub Pages（推荐，自动发布，本项目已部署）

> 本项目已部署到 **https://pakleung.github.io/three-point-trainer/**，直接用 iPhone Safari 打开即可。下面是复刻 / 自行托管步骤。

1. 把整个仓库推到 GitHub。
2. 仓库 **Settings → Pages → Source** 选 **Deploy from a branch**，Branch 选 `main`、目录选根目录 `/ (root)`，保存。
3. 稍等 1~2 分钟构建完成，即可通过 `https://<用户名>.github.io/<仓库名>/` 访问；之后每次推 `main` 都会自动重新发布。
4. 在 iPhone 的 Safari 打开该 https 地址 → 见下方「iPhone 安装步骤」即可变成离线 App。

> 提示：`.nojekyll` 已就位，避免 GitHub Pages 忽略以 `.` 开头的文件（如 `apple-touch-icon.png` 之外的特殊资源）。

### 方式二：Cloudflare Pages

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**。
2. 二选一：
   - **连接 Git**：授权并选择本仓库，构建命令留空、输出目录填 `.`（根目录），保存后自动部署。
   - **直接拖拽上传**：把 `dist/` 目录拖到上传框即可（`dist/` 可由 `python build_app_package.py` 生成，里面包含完整 PWA 静态文件）；或直接把**仓库根目录的静态文件**（index.html、app.js、style.css、manifest.json、sw.js、各图标）整体上传。
3. 拿到 `https://<项目名>.pages.dev` 地址后，用 iPhone Safari 打开并按下方步骤安装。

---

## 二、本地预览

```bash
cd three-point-trainer
python -m http.server 8080
```

然后浏览器打开 `http://localhost:8080`。

> ⚠️ Service Worker 只在 `http(s)` 或 `localhost` 下生效，`file://` 直接双击打开 HTML 无法注册离线缓存（但仍可当普通网页用，数据存本地）。

---

## 三、iPhone 安装步骤（重点）

1. 用 **Safari** 打开上面部署好的 **https** 地址（GitHub Pages / Cloudflare Pages 的域名）。
2. 点 Safari 底部中间的 **「分享」方块**（↑ 图标）。
3. 在分享菜单里向下滚，找到并点 **「添加到主屏幕」**。
4. 给 App 命名为 **「三分训练」**，点右上角「添加」。
5. 桌面出现篮球图标，**点开即全屏离线 App**：首次需联网加载一次，之后断网 / 关掉电脑服务器也能打开（Service Worker 已缓存全部资源）。

> 首次在 iOS Safari（未安装状态）打开时，顶部会出现一条引导提示条，点「知道了」后用 `localStorage` 记住，下次不再显示。

---

## 四、数据说明

- 所有训练记录都存在 **iPhone Safari 本地（localStorage）**，不上传任何服务器，隐私安全。
- **换手机 / 卸载 Safari / 清理 Safari 缓存会丢数据**，务必定期备份：
  - 「概览」页 → **导出备份 (JSON)**：一键导出全部记录（含点位、动作、命中率、投失打框位置等），可存到「文件」App → iCloud。
  - 或 **导出 Excel (CSV)**，用 Numbers / WPS 打开查看。
- 恢复：在「概览」页点 **导入备份 (JSON)** / **导入 Excel (CSV)**，选本地备份文件即可整体恢复（会自动生成新 id，避免冲突）。
- 首次打开会自动写入一份示例数据，方便你立刻看到分析页效果。

---

## 五、已知限制

- iOS 上的 PWA 不支持「添加到主屏幕」之外的原生能力（如系统级通知、后台同步等）。
- **首次需联网加载一次**，之后才能离线使用（Service Worker 缓存 App 外壳）。
- 数据仅存于当前浏览器本地：换浏览器、无痕模式、清缓存都会清空；请依赖 JSON/CSV 备份跨设备迁移。
- 部分老版本 iOS 对 `manifest` 的 `display_override` 支持有限，但 `display: standalone` 已足够全屏运行。

---

## 六、目录结构

```
three-point-trainer/
├── index.html            # 主页面（三 tab：训练 / 概览 / 分析）
├── app.js                # 全部逻辑：存储层、图表、CSV/JSON 导入导出、iOS 引导
├── style.css             # 暗色主题样式
├── sw.js                 # Service Worker（离线缓存，版本 threePointTrainer-v5）
├── manifest.json         # Web App Manifest（含 192/512/180 图标）
├── icon.png / icon-512.png / apple-touch-icon.png / favicon.ico
├── build_standalone.py   # 生成单文件离线版 dist/three-point-trainer.html
├── build_app_package.py   # 打包完整安装包 zip + 同步 dist/
├── .nojekyll             # 让 GitHub Pages 不忽略特殊文件
└── README.md
```

> 构建产物：`python build_standalone.py` 生成单文件版，`python build_app_package.py` 生成安装包 zip 并同步 `dist/`。脚本仅做文件内联 / 打包，不改变任何数据格式与字段。
