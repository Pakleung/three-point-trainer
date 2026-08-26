"use strict";

/* ================= 配置 ================= */
const SPOTS = ["左底角", "左翼45°", "弧顶", "右翼45°", "右底角"];
const MOVES = ["常规训练", "1段式", "1.5段式", "2段式"];
const COLORS = ["#E8743B", "#4ea1ff", "#3ecf8e", "#ffd166", "#c792ea"];
/* 球场坐标变换：以英尺为单位，篮筐在底部中央，按 NBA 半场尺寸绘制
   半场 50ft 宽 × 47ft 长；篮筐中心距底线 5.25ft；三分线半径 23.75ft(弧顶)/22ft(底角) */
const COURT = { M: 16, S: 6.6, baseY: 425, W: 360, H: 460 };
const sx = (fx) => COURT.M + fx * COURT.S;
const sy = (fy) => COURT.baseY - fy * COURT.S;
const HOOP_COURT = { cx: sx(25), cy: sy(5.25) };
const R_ARC = 23.75 * COURT.S;
const R_SPOT = R_ARC + 3 * COURT.S;
// 5 个三分点位在球场 SVG 中的屏幕坐标（距篮筐外一步，投篮合法）；训练页/分析页共用
const SPOT_POS = {
  "左底角": [sx(2), sy(5)],
  "右底角": [sx(48), sy(5)],
  "左翼45°": [HOOP_COURT.cx + R_SPOT * Math.cos((225 * Math.PI) / 180), HOOP_COURT.cy + R_SPOT * Math.sin((225 * Math.PI) / 180)],
  "右翼45°": [HOOP_COURT.cx + R_SPOT * Math.cos((315 * Math.PI) / 180), HOOP_COURT.cy + R_SPOT * Math.sin((315 * Math.PI) / 180)],
  "弧顶": [HOOP_COURT.cx, HOOP_COURT.cy - R_SPOT],
};
// 篮筐俯瞰图（0°=正上）里「射手方位」与「篮板方位」：篮板在射手正对面
function spotShooterAngle(spot) {
  const [px, py] = SPOT_POS[spot];
  const dx = px - HOOP_COURT.cx, dy = py - HOOP_COURT.cy;
  let a = (Math.atan2(-dy, dx) * 180) / Math.PI + 90;
  return (a % 360 + 360) % 360;
}
function backboardAngle(spot) { return (spotShooterAngle(spot) + 180) % 360; }
const LS_KEY = "threePointTrainer.records.v1";
let _lsSeq = 0;

/* ================= 本地存储（localStorage，离线/文件直开均可用） ================= */
function _lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function _lsSave(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
  catch (e) { console.warn("本地存储写入失败：", e.message); }
}
function addRecord(r) {
  return new Promise((res) => {
    const arr = _lsLoad();
    const rec = Object.assign({}, r, { id: "r" + Date.now() + "_" + (++_lsSeq) });
    arr.push(rec);
    _lsSave(arr);
    res(rec.id);
  });
}
function getAllRecords() {
  return new Promise((res) => res(_lsLoad()));
}
// 只取新格式记录（含 spot 字段），旧聚合格式忽略
async function getRecords() {
  const all = await getAllRecords();
  return all
    .filter((r) => r && typeof r.spot === "string" && typeof r.made === "number")
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/* ================= 工具 ================= */
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function rateColor(r) {
  if (r == null) return "#333845";
  const bad = [255, 107, 107], mid = [255, 209, 102], good = [62, 207, 142];
  let c;
  if (r < 50) { const t = r / 50; c = bad.map((b, i) => Math.round(b + (mid[i] - b) * t)); }
  else { const t = (r - 50) / 50; c = mid.map((m, i) => Math.round(m + (good[i] - m) * t)); }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function svgEl(tag, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.opacity = "0"), 1800);
}

/* ================= 训练状态 ================= */
let currentSpot = null;
let currentMove = MOVES[0];
let tMade = 0, tAtt = 0, tDur = 0, tRunning = false, tTimer = null;
let shotEvents = [];   // 本次训练每次出手：{type:'made'} 或 {type:'miss', angle:number|null}

/* ================= 球场 SVG ================= */
// clickable: 是否可点击；rates: {spot: rate|null}；showRate: 是否标命中率；onSpotClick: 点位点击回调(分析下钻用)
function buildCourt({ clickable = false, rates = null, showRate = false, onSpotClick = null } = {}) {
  const { W, H } = COURT;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const line = "#39435a", accent = "#E8743B";

  // 地板（半场矩形：底线在底部，中线在顶部）
  const courtX = sx(0), courtY = sy(47), courtW = sx(50) - sx(0), courtH = sy(0) - sy(47);
  svg.appendChild(svgEl("rect", { x: courtX, y: courtY, width: courtW, height: courtH, rx: 10, fill: "#1c2330", stroke: line, "stroke-width": 2 }));

  const cx = sx(25), cy = sy(5.25); // 篮筐中心

  // 中线 + 中圈（半圆，仅下半在半场内）
  svg.appendChild(svgEl("line", { x1: courtX, y1: courtY, x2: courtX + courtW, y2: courtY, stroke: line, "stroke-width": 2 }));
  svg.appendChild(svgEl("circle", { cx, cy: courtY, r: 6 * COURT.S, fill: "none", stroke: line, "stroke-width": 1.5 }));

  // 三分线：底角(底线)直线段 + 以篮筐为圆心的圆弧
  const R = 23.75 * COURT.S;
  const cornerL = [sx(3), sy(0)], cornerR = [sx(47), sy(0)];
  const arcEndL = [sx(3), sy(14.2)], arcEndR = [sx(47), sy(14.2)];
  const aL = Math.atan2(arcEndL[1] - cy, arcEndL[0] - cx);
  const aR = Math.atan2(arcEndR[1] - cy, arcEndR[0] - cx);
  const N = 48, arcPts = [];
  for (let i = 0; i <= N; i++) {
    const a = aL + (aR - aL) * i / N;
    arcPts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  const tp = (p) => p[0].toFixed(1) + " " + p[1].toFixed(1);
  const dThree = `M ${tp(cornerL)} L ${tp(arcEndL)} ` +
    arcPts.map((p, i) => (i ? "L" : "M") + tp(p)).join(" ") + ` L ${tp(arcEndR)} L ${tp(cornerR)}`;
  svg.appendChild(svgEl("path", { d: dThree, fill: "none", stroke: line, "stroke-width": 2.5 }));

  // 罚球区(油漆区) + 罚球圈
  const keyX = sx(17), keyY = sy(19), keyW = sx(33) - sx(17), keyH = sy(0) - sy(19);
  svg.appendChild(svgEl("rect", { x: keyX, y: keyY, width: keyW, height: keyH, fill: "rgba(232,116,59,.10)", stroke: line, "stroke-width": 2 }));
  svg.appendChild(svgEl("circle", { cx, cy: keyY, r: 6 * COURT.S, fill: "none", stroke: line, "stroke-width": 2 }));

  // 篮下限制区弧(半径 4ft)
  const raR = 4 * COURT.S;
  svg.appendChild(svgEl("path", { d: `M ${cx - raR} ${cy} A ${raR} ${raR} 0 0 1 ${cx + raR} ${cy}`, fill: "none", stroke: line, "stroke-width": 1.5 }));

  // 篮板 + 篮筐
  svg.appendChild(svgEl("line", { x1: sx(22), y1: sy(4), x2: sx(28), y2: sy(4), stroke: accent, "stroke-width": 4, "stroke-linecap": "round" }));
  svg.appendChild(svgEl("circle", { cx, cy, r: 5, fill: "none", stroke: accent, "stroke-width": 3 }));

  // 5 个三分训练点位（坐标见模块级 SPOT_POS）
  SPOTS.forEach((name) => {
    const [cxp, cyp] = SPOT_POS[name];
    const rate = rates ? rates[name] : null;
    const fill = rate != null ? rateColor(rate) : (clickable ? "#2a3340" : "#333845");
    const g = svgEl("g", clickable ? { class: "spot-hit" } : {});
    if (clickable) {
      g.setAttribute("data-spot", name);
      if (onSpotClick) g.addEventListener("click", () => onSpotClick(name));
    }
    g.appendChild(svgEl("circle", { cx: cxp, cy: cyp, r: 13, fill, stroke: "#0f1115", "stroke-width": 2 }));
    if (showRate && rate != null) {
      const t = svgEl("text", { x: cxp, y: cyp + 4, "text-anchor": "middle", class: "spot-rate-txt" });
      t.textContent = rate + "%";
      g.appendChild(t);
    }
    const labelAbove = name === "左底角" || name === "右底角";
    const lab = svgEl("text", { x: cxp, y: labelAbove ? cyp - 20 : cyp + 30, "text-anchor": "middle", class: "spot-label" });
    lab.textContent = name;
    g.appendChild(lab);
    svg.appendChild(g);
  });
  return svg;
}

/* ================= 训练页：球场 → 点位 ================= */
function showCourt() {
  currentSpot = null;
  document.getElementById("spot-view").hidden = true;
  document.getElementById("court-view").hidden = false;
  const wrap = document.getElementById("court-svg");
  wrap.innerHTML = "";
  wrap.appendChild(buildCourt({ clickable: true }));
}
document.getElementById("court-svg").addEventListener("click", (e) => {
  const g = e.target.closest(".spot-hit");
  if (g) showSpot(g.getAttribute("data-spot"));
});
document.getElementById("back-court").addEventListener("click", showCourt);

function showSpot(spot) {
  currentSpot = spot;
  currentMove = MOVES[0];
  tMade = 0; tAtt = 0; tDur = 0; stopTimer();
  shotEvents = [];
  document.getElementById("court-view").hidden = true;
  document.getElementById("spot-view").hidden = false;
  document.getElementById("spot-title").textContent = spot;
  renderMoveButtons();
  updateSpotDisplays();
  renderMissRing();
  renderHeatHoop();
  renderSpotHistory();
}
function renderMoveButtons() {
  const box = document.getElementById("move-buttons");
  box.innerHTML = "";
  MOVES.forEach((m) => {
    const b = document.createElement("button");
    b.className = "move-btn" + (m === currentMove ? " active" : "");
    b.textContent = m;
    b.addEventListener("click", () => { currentMove = m; renderMoveButtons(); });
    box.appendChild(b);
  });
}
function updateSpotDisplays() {
  document.getElementById("spot-made").textContent = tMade;
  document.getElementById("spot-att").textContent = tAtt;
  document.getElementById("spot-time").textContent = fmtTime(tDur);
  document.getElementById("spot-rate").textContent =
    tAtt > 0 ? "实时命中率 " + Math.round((tMade / tAtt) * 100) + "%" : "实时命中率 --";
  document.getElementById("spot-timer-btn").textContent = tRunning ? "暂停" : "开始";
}

/* 计时器 */
function startTimer() {
  if (tRunning) return;
  tRunning = true;
  tTimer = setInterval(() => {
    tDur++;
    document.getElementById("spot-time").textContent = fmtTime(tDur);
  }, 1000);
  updateSpotDisplays();
}
function stopTimer() {
  if (!tRunning) return;
  tRunning = false;
  clearInterval(tTimer);
  tTimer = null;
  updateSpotDisplays();
}
document.getElementById("spot-timer-btn").addEventListener("click", () => (tRunning ? stopTimer() : startTimer()));
document.getElementById("spot-timer-reset").addEventListener("click", () => { stopTimer(); tDur = 0; updateSpotDisplays(); });

/* 进球 / 投失 + 篮筐俯视失误点记录 */
document.getElementById("btn-made").addEventListener("click", recordMade);
// 投失：快速记一次「打前沿」（射手正对篮筐那一侧），也可点篮筐精确位置
document.getElementById("btn-miss").addEventListener("click", () => recordMiss(spotShooterAngle(currentSpot)));
// 没碰篮筐（空气球）：记一次出手但无打框位置
document.getElementById("btn-no-rim").addEventListener("click", () => recordMiss(null));

function recordMade() {
  tMade++; tAtt++;
  shotEvents.push({ type: "made" });
  updateSpotDisplays();
  renderHeatHoop();
  toast("进球 +1 ✅");
}
function recordMiss(angle) {
  tAtt++;
  shotEvents.push({ type: "miss", angle });
  updateSpotDisplays();
  renderHeatHoop();
  toast(angle == null ? "没碰篮筐 · 出手+1" : "已记录失误点 · 出手+1");
}

/* ================= 篮筐俯视图（记录失误点 / 投篮热力图） ================= */
const HOOP = { cx: 120, cy: 120, rRim: 70, rOpen: 56, rRingIn: 64, rRingOut: 86, seg: 24 };
function hoopPt(r, angDeg) {
  const a = (angDeg - 90) * Math.PI / 180; // 0°=正上方，顺时针
  return [HOOP.cx + r * Math.cos(a), HOOP.cy + r * Math.sin(a)];
}
function annulusSector(rIn, rOut, a0, a1) {
  const [x0, y0] = hoopPt(rOut, a0), [x1, y1] = hoopPt(rOut, a1);
  const [x2, y2] = hoopPt(rIn, a1), [x3, y3] = hoopPt(rIn, a0);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rOut} ${rOut} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} ` +
         `L ${x2.toFixed(1)} ${y2.toFixed(1)} A ${rIn} ${rIn} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
}
function buildHoopBase(svg) {
  svg.appendChild(svgEl("circle", { cx: HOOP.cx, cy: HOOP.cy, r: HOOP.rRingOut + 12, fill: "#161b24", stroke: "#2c313c", "stroke-width": 1 }));
  svg.appendChild(svgEl("circle", { cx: HOOP.cx, cy: HOOP.cy, r: HOOP.rOpen, fill: "#0c0f15", stroke: "#39435a", "stroke-width": 1.5 }));
  svg.appendChild(svgEl("circle", { cx: HOOP.cx, cy: HOOP.cy, r: HOOP.rRim, fill: "none", stroke: "#E8743B", "stroke-width": 6 }));
  const cl = 7;
  svg.appendChild(svgEl("line", { x1: HOOP.cx - cl, y1: HOOP.cy, x2: HOOP.cx + cl, y2: HOOP.cy, stroke: "#3ecf8e", "stroke-width": 1.5, "stroke-opacity": 0.6 }));
  svg.appendChild(svgEl("line", { x1: HOOP.cx, y1: HOOP.cy - cl, x2: HOOP.cx, y2: HOOP.cy + cl, stroke: "#3ecf8e", "stroke-width": 1.5, "stroke-opacity": 0.6 }));
}
/* 篮板：画成一块矩形板子，前缘与篮筐外缘外切，板身向后（远离投篮人）延伸，不插入篮筐 */
function drawBackboard(svg, angleDeg) {
  const frontR = HOOP.rRingOut + 14;       // 前缘刚落在深色篮筐底盘外缘外侧（外切）
  const depth = 20;                        // 板子向后延伸的深度
  const halfW = 48;                        // 板子半宽
  const [fx, fy] = hoopPt(frontR, angleDeg);
  const outA = (angleDeg - 90) * Math.PI / 180; // 从篮筐中心指向篮板方向
  const sideA = angleDeg * Math.PI / 180;       // 沿前缘的横向方向
  const ox = Math.cos(outA), oy = Math.sin(outA);
  const sx = Math.cos(sideA), sy = Math.sin(sideA);
  // 前缘两个角
  const flx = fx - sx * halfW, fly = fy - sy * halfW;
  const frx = fx + sx * halfW, fry = fy + sy * halfW;
  // 后缘两个角（向后延伸）
  const blx = flx + ox * depth, bly = fly + oy * depth;
  const brx = frx + ox * depth, bry = fry + oy * depth;
  const d = `M ${flx.toFixed(1)} ${fly.toFixed(1)} L ${frx.toFixed(1)} ${fry.toFixed(1)} ` +
            `L ${brx.toFixed(1)} ${bry.toFixed(1)} L ${blx.toFixed(1)} ${bly.toFixed(1)} Z`;
  svg.appendChild(svgEl("path", {
    d, fill: "rgba(127,168,255,.18)", stroke: "#7fa8ff", "stroke-width": 2, "stroke-linejoin": "round"
  }));
}
function renderMissRing() {
  const wrap = document.getElementById("miss-ring");
  wrap.innerHTML = "";
  const svg = svgEl("svg", { viewBox: "0 0 240 240", role: "img" });
  drawBackboard(svg, backboardAngle(currentSpot));
  buildHoopBase(svg);
  const step = 360 / HOOP.seg;
  for (let i = 0; i < HOOP.seg; i++) {
    const a0 = i * step - step / 2, a1 = i * step + step / 2, ac = i * step;
    const seg = svgEl("path", { d: annulusSector(HOOP.rRingIn, HOOP.rRingOut, a0, a1), fill: "rgba(232,116,59,.16)", stroke: "rgba(232,116,59,.35)", "stroke-width": 1, "class": "rim-seg" });
    seg.addEventListener("click", () => recordMiss(ac));
    svg.appendChild(seg);
  }
  wrap.appendChild(svg);
}
function renderHeatHoop() {
  const wrap = document.getElementById("heat-hoop");
  wrap.innerHTML = "";
  const svg = svgEl("svg", { viewBox: "0 0 240 240", role: "img" });
  drawBackboard(svg, backboardAngle(currentSpot));
  buildHoopBase(svg);
  const madeN = shotEvents.filter((e) => e.type === "made").length;
  const missBuckets = {};
  let noRim = 0;
  shotEvents.forEach((e) => {
    if (e.type !== "miss") return;
    if (e.angle == null) { noRim++; return; }
    const b = Math.round(e.angle / (360 / HOOP.seg)) * (360 / HOOP.seg);
    missBuckets[b] = (missBuckets[b] || 0) + 1;
  });
  const maxC = Math.max(1, madeN, ...Object.values(missBuckets), noRim);
  if (madeN > 0) {
    const r = 8 + (madeN / maxC) * 14;
    svg.appendChild(svgEl("circle", { cx: HOOP.cx, cy: HOOP.cy, r, fill: "rgba(62,207,142,.55)", stroke: "#3ecf8e", "stroke-width": 1.5 }));
  }
  Object.keys(missBuckets).forEach((b) => {
    const c = missBuckets[b];
    const [x, y] = hoopPt(HOOP.rRim, +b);
    const r = 7 + (c / maxC) * 16;
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: "rgba(255,107,107,.6)", stroke: "#ff6b6b", "stroke-width": 1.5 }));
  });
  if (noRim > 0) {
    // 没碰篮筐：在射手一侧画灰色空心圈区分
    const sa = spotShooterAngle(currentSpot);
    const [x, y] = hoopPt(HOOP.rRim, sa);
    const r = 7 + (noRim / maxC) * 16;
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: "none", stroke: "#9aa0ab", "stroke-width": 2.5, "stroke-dasharray": "4 3" }));
  }
  wrap.appendChild(svg);
  const lg = document.createElement("div");
  lg.className = "hoop-legend";
  const missRim = shotEvents.length - madeN - noRim;
  lg.innerHTML = `<span><i style="background:#3ecf8e"></i>进球 ${madeN}</span>` +
    `<span><i style="background:#ff6b6b"></i>打框 ${missRim}</span>` +
    (noRim > 0 ? `<span><i style="background:#9aa0ab"></i>没碰筐 ${noRim}</span>` : "");
  wrap.appendChild(lg);
}

/* 保存一条记录 */
document.getElementById("save-record").addEventListener("click", async () => {
  if (!currentSpot) return;
  if (tMade === 0 && tAtt === 0) { alert("先记录进球或出手再保存"); return; }
  const rec = {
    date: new Date().toISOString().slice(0, 10),
    spot: currentSpot,
    move: currentMove,
    made: tMade,
    attempted: tAtt,
    duration: tDur,
    missAngles: shotEvents.filter((e) => e.type === "miss").map((e) => e.angle),
    createdAt: Date.now(),
  };
  await addRecord(rec);
  stopTimer(); tMade = 0; tAtt = 0; tDur = 0;
  updateSpotDisplays();
  renderSpotHistory();
  toast("已保存 ✅");
});

async function renderSpotHistory() {
  const box = document.getElementById("spot-history");
  const recs = (await getRecords()).filter((r) => r.spot === currentSpot);
  if (recs.length === 0) { box.innerHTML = '<div class="hint">还没有这条点位的记录。</div>'; return; }
  box.innerHTML = recs.slice(-6).reverse().map((r) => {
    const rate = r.attempted > 0 ? Math.round((r.made / r.attempted) * 100) : 0;
    return `<div class="history-item">
      <span class="hi-meta">${r.date} · ${r.move}</span>
      <span class="hi-rate" style="color:${rateColor(rate)}">${rate}% · ${r.made}/${r.attempted} · ${fmtTime(r.duration)}</span>
    </div>`;
  }).join("");
}

/* ================= Tab 切换 ================= */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "train") showCourt();
  if (name === "overview") renderOverview();
  if (name === "analysis") { closeSpotDrill(); renderAnalysis(); }
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

/* ================= 概览 ================= */
async function renderOverview() {
  const recs = await getRecords();
  const ov = document.getElementById("overview-stats");
  if (recs.length === 0) {
    ov.innerHTML = '<div class="empty">还没有训练记录，去「训练」页开始第一次吧。</div>';
    document.getElementById("overview-spots").innerHTML = "";
    document.getElementById("overview-moves").innerHTML = "";
    return;
  }
  let totMade = 0, totAtt = 0, totDur = 0;
  const perSpot = SPOTS.map(() => ({ made: 0, att: 0 }));
  const perMove = {};
  recs.forEach((r) => {
    totMade += r.made; totAtt += r.attempted; totDur += r.duration;
    const si = SPOTS.indexOf(r.spot);
    if (si >= 0) { perSpot[si].made += r.made; perSpot[si].att += r.attempted; }
    if (!perMove[r.move]) perMove[r.move] = { made: 0, att: 0, n: 0 };
    perMove[r.move].made += r.made; perMove[r.move].att += r.attempted; perMove[r.move].n++;
  });
  const rate = totAtt > 0 ? Math.round((totMade / totAtt) * 100) : 0;
  ov.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="v">${rate}%</div><div class="l">总命中率</div></div>
      <div class="stat"><div class="v">${recs.length}</div><div class="l">训练条数</div></div>
      <div class="stat"><div class="v">${totAtt}</div><div class="l">总出手</div></div>
      <div class="stat"><div class="v">${totMade}</div><div class="l">总命中</div></div>
      <div class="stat full"><div class="v">${fmtTime(totDur)}</div><div class="l">累计训练时长</div></div>
    </div>`;
  document.getElementById("overview-spots").innerHTML =
    '<div class="section-h">各点位</div>' +
    SPOTS.map((n, i) => {
      const r = perSpot[i].att > 0 ? Math.round((perSpot[i].made / perSpot[i].att) * 100) : 0;
      return `<div class="spot-summary"><div class="row"><span>${n}</span><span style="color:${COLORS[i]}">${r}%</span></div>
        <div class="row"><span style="color:var(--muted)">命中 ${perSpot[i].made} / 出手 ${perSpot[i].att}</span></div></div>`;
    }).join("");
  const moveNames = Object.keys(perMove);
  document.getElementById("overview-moves").innerHTML =
    '<div class="section-h">各投篮动作</div>' +
    moveNames.map((m) => {
      const d = perMove[m];
      const r = d.att > 0 ? Math.round((d.made / d.att) * 100) : 0;
      return `<div class="move-summary"><div class="row"><span>${m}</span><span style="color:var(--accent)">${r}%</span></div>
        <div class="row"><span style="color:var(--muted)">${d.n} 条 · 命中 ${d.made} / 出手 ${d.att}</span></div></div>`;
    }).join("");
}

/* ================= 分析 / SVG 图表 ================= */
async function renderAnalysis() {
  const recs = await getRecords();
  const blocks = ["north-star", "chart-court", "chart-trend", "chart-by-move", "chart-by-spot", "chart-volume", "chart-growth"];
  if (recs.length === 0) {
    blocks.forEach((id) => (document.getElementById(id).innerHTML = '<div class="empty">先去记录训练，才能看分析。</div>'));
    return;
  }

  // 北极星指标
  let totMade = 0, totAtt = 0, totDur = 0;
  recs.forEach((r) => { totMade += r.made; totAtt += r.attempted; totDur += r.duration; });
  const rate = totAtt > 0 ? Math.round((totMade / totAtt) * 100) : 0;
  document.getElementById("north-star").innerHTML = `
    <div class="ns-label">北极星指标 · 总训练命中率</div>
    <div class="ns-value">${rate}%</div>
    <div class="ns-sub">
      <span>命中 <b>${totMade}</b></span>
      <span>出手 <b>${totAtt}</b></span>
      <span>条数 <b>${recs.length}</b></span>
      <span>时长 <b>${fmtTime(totDur)}</b></span>
    </div>`;

  // 各点位命中率（球场热力图）
  const perSpot = SPOTS.map(() => ({ made: 0, att: 0 }));
  recs.forEach((r) => { const i = SPOTS.indexOf(r.spot); if (i >= 0) { perSpot[i].made += r.made; perSpot[i].att += r.attempted; } });
  const spotRates = {};
  SPOTS.forEach((n, i) => (spotRates[n] = perSpot[i].att > 0 ? Math.round((perSpot[i].made / perSpot[i].att) * 100) : null));
  const courtWrap = document.getElementById("chart-court");
  courtWrap.innerHTML = "";
  courtWrap.appendChild(buildCourt({ clickable: true, rates: spotRates, showRate: true, onSpotClick: openSpotDrill }));

  // 命中率成长曲线（累计）
  let cumM = 0, cumA = 0;
  const trendPts = recs.map((r) => { cumM += r.made; cumA += r.attempted; return { x: 0, y: cumA > 0 ? Math.round((cumM / cumA) * 100) : 0 }; });
  trendPts.forEach((p, i) => (p.x = i + 1));
  drawLineChart(document.getElementById("chart-trend"), [{ name: "累计命中率", color: "#E8743B", points: trendPts }], { yMax: 100, unit: "%" });

  // 按投篮动作拆分命中率
  const perMove = {};
  recs.forEach((r) => {
    if (!perMove[r.move]) perMove[r.move] = { made: 0, att: 0 };
    perMove[r.move].made += r.made; perMove[r.move].att += r.attempted;
  });
  const moveItems = Object.keys(perMove).map((m) => ({
    label: m,
    value: perMove[m].att > 0 ? Math.round((perMove[m].made / perMove[m].att) * 100) : 0,
    color: "#E8743B",
  }));
  drawBarChart(document.getElementById("chart-by-move"), moveItems);

  // 按点位拆分命中率
  const spotItems = SPOTS.map((n, i) => ({
    label: n,
    value: perSpot[i].att > 0 ? Math.round((perSpot[i].made / perSpot[i].att) * 100) : 0,
    color: COLORS[i],
  }));
  drawBarChart(document.getElementById("chart-by-spot"), spotItems);

  // 出手量走势（累计）
  let cum = 0;
  const volPts = recs.map((r) => { cum += r.attempted; return { x: 0, y: cum }; });
  volPts.forEach((p, i) => (p.x = i + 1));
  const volMax = Math.max(1, cum);
  drawLineChart(document.getElementById("chart-volume"), [{ name: "累计出手", color: "#4ea1ff", points: volPts }], { yMax: volMax, unit: "" });

  // 早期 vs 近期 命中率（按点位分组）
  drawGrowth(document.getElementById("chart-growth"), recs);
}

/* ================= 分析页：点位下钻 ================= */
const ANALYSIS_BLOCKS = ["north-star", "chart-court", "chart-trend", "chart-by-move", "chart-by-spot", "chart-volume", "chart-growth"];
function showDrill() {
  document.getElementById("spot-drill").hidden = false;
  ANALYSIS_BLOCKS.forEach((id) => (document.getElementById(id).hidden = true));
}
function closeSpotDrill() {
  document.getElementById("spot-drill").hidden = true;
  ANALYSIS_BLOCKS.forEach((id) => (document.getElementById(id).hidden = false));
}
async function openSpotDrill(spot) {
  const all = await getRecords();
  const recs = all.filter((r) => r.spot === spot);
  const drill = document.getElementById("spot-drill");
  if (recs.length === 0) {
    drill.innerHTML = `<button id="drill-back" class="btn-back">← 返回分析</button><div class="empty">该点位暂无记录</div>`;
    drill.querySelector("#drill-back").addEventListener("click", closeSpotDrill);
    showDrill();
    return;
  }
  let totM = 0, totA = 0, totDur = 0;
  const perMove = {};
  const angles = [];
  let noRim = 0;
  recs.forEach((r) => {
    totM += r.made; totA += r.attempted; totDur += r.duration;
    if (!perMove[r.move]) perMove[r.move] = { made: 0, att: 0, n: 0 };
    perMove[r.move].made += r.made; perMove[r.move].att += r.attempted; perMove[r.move].n++;
    (r.missAngles || []).forEach((a) => { if (a == null) noRim++; else angles.push(a); });
  });
  const rate = totA > 0 ? Math.round((totM / totA) * 100) : 0;
  drill.innerHTML = `
    <button id="drill-back" class="btn-back">← 返回分析</button>
    <h2 class="spot-title">${spot} · 点位详情</h2>
    <div class="stat-grid">
      <div class="stat"><div class="v">${rate}%</div><div class="l">命中率</div></div>
      <div class="stat"><div class="v">${totA}</div><div class="l">出手</div></div>
      <div class="stat"><div class="v">${totM}</div><div class="l">命中</div></div>
      <div class="stat"><div class="v">${recs.length}</div><div class="l">训练次数</div></div>
      <div class="stat full"><div class="v">${fmtTime(totDur)}</div><div class="l">累计训练时长</div></div>
    </div>
    <div class="chart-block"><h3>历史命中率走势（累计）</h3><div id="drill-trend"></div></div>
    <div class="chart-block"><h3>投篮投失热力图（篮筐俯瞰）</h3><div id="drill-miss"></div><div class="hint">红=打框位置 · 灰虚线=没碰篮筐 · 蓝=篮板朝向</div></div>
    <div class="chart-block"><h3>按动作拆分命中率</h3><div id="drill-move"></div></div>`;
  document.getElementById("drill-back").addEventListener("click", closeSpotDrill);
  // 历史命中率走势（累计）
  let cumM = 0, cumA = 0;
  const tp = recs.map((r) => { cumM += r.made; cumA += r.attempted; return { x: 0, y: cumA > 0 ? Math.round((cumM / cumA) * 100) : 0 }; });
  tp.forEach((p, i) => (p.x = i + 1));
  drawLineChart(document.getElementById("drill-trend"), [{ name: "累计命中率", color: "#E8743B", points: tp }], { yMax: 100, unit: "%" });
  // 投失热力图（聚合）
  renderAggregateMissHoop(document.getElementById("drill-miss"), angles, noRim, spot);
  // 按动作拆分
  const moveItems = Object.keys(perMove).map((m) => ({
    label: m,
    value: perMove[m].att > 0 ? Math.round((perMove[m].made / perMove[m].att) * 100) : 0,
    color: "#E8743B",
  }));
  drawBarChart(document.getElementById("drill-move"), moveItems);
  showDrill();
}
function renderAggregateMissHoop(container, angles, noRim, spot) {
  container.innerHTML = "";
  const svg = svgEl("svg", { viewBox: "0 0 240 240", role: "img" });
  drawBackboard(svg, backboardAngle(spot));
  buildHoopBase(svg);
  const buckets = {};
  angles.forEach((a) => { const b = Math.round(a / (360 / HOOP.seg)) * (360 / HOOP.seg); buckets[b] = (buckets[b] || 0) + 1; });
  const maxC = Math.max(1, ...Object.values(buckets), noRim);
  Object.keys(buckets).forEach((b) => {
    const c = buckets[b];
    const [x, y] = hoopPt(HOOP.rRim, +b);
    const r = 7 + (c / maxC) * 16;
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: "rgba(255,107,107,.6)", stroke: "#ff6b6b", "stroke-width": 1.5 }));
  });
  if (noRim > 0) {
    const [x, y] = hoopPt(HOOP.rRim, spotShooterAngle(spot));
    const r = 7 + (noRim / maxC) * 16;
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: "none", stroke: "#9aa0ab", "stroke-width": 2.5, "stroke-dasharray": "4 3" }));
  }
  container.appendChild(svg);
  if (angles.length === 0 && noRim === 0) {
    const note = document.createElement("div");
    note.className = "hint";
    note.style.textAlign = "center";
    note.textContent = "该点位暂无失误点记录（旧数据未包含打框位置）";
    container.appendChild(note);
  } else {
    const lg = document.createElement("div");
    lg.className = "hoop-legend";
    lg.innerHTML = `<span><i style="background:#ff6b6b"></i>打框 ${angles.length}</span>` +
      (noRim > 0 ? `<span><i style="background:#9aa0ab"></i>没碰筐 ${noRim}</span>` : "");
    container.appendChild(lg);
  }
}

function drawGrowth(container, recs) {
  const n = recs.length;
  const cut = Math.max(1, Math.floor(n / 3));
  const early = recs.slice(0, cut);
  const recent = recs.slice(n - cut);
  const agg = (list) => {
    const m = {};
    SPOTS.forEach((s) => (m[s] = { made: 0, att: 0 }));
    list.forEach((r) => { const i = SPOTS.indexOf(r.spot); if (i >= 0) { m[r.spot].made += r.made; m[r.spot].att += r.attempted; } });
    return m;
  };
  const aE = agg(early), aR = agg(recent);
  const W = 340, H = 230, padL = 34, padR = 10, padT = 12, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yOf = (v) => padT + plotH * (1 - v / 100);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  [0, 25, 50, 75, 100].forEach((g) => {
    svg.appendChild(svgEl("line", { x1: padL, y1: yOf(g), x2: W - padR, y2: yOf(g), stroke: "#2c313c", "stroke-width": 1 }));
    const t = svgEl("text", { x: padL - 6, y: yOf(g) + 4, fill: "#9aa0ab", "font-size": 10, "text-anchor": "end" });
    t.textContent = g + "%"; svg.appendChild(t);
  });
  const groupW = plotW / SPOTS.length;
  const bw = groupW * 0.32;
  SPOTS.forEach((name, i) => {
    const eR = aE[name].att > 0 ? Math.round((aE[name].made / aE[name].att) * 100) : 0;
    const rR = aR[name].att > 0 ? Math.round((aR[name].made / aR[name].att) * 100) : 0;
    const x0 = padL + groupW * i + groupW * 0.18;
    const yE = yOf(eR), yR = yOf(rR);
    svg.appendChild(svgEl("rect", { x: x0, y: yE, width: bw, height: padT + plotH - yE, rx: 3, fill: "#5b6577" }));
    svg.appendChild(svgEl("rect", { x: x0 + bw + 3, y: yR, width: bw, height: padT + plotH - yR, rx: 3, fill: "#E8743B" }));
    const lt = svgEl("text", { x: x0 + bw + 1.5, y: H - padB + 16, fill: "#c8ccd4", "font-size": 10, "text-anchor": "middle" });
    lt.textContent = name; svg.appendChild(lt);
  });
  // 图例
  const legend = [["早期", "#5b6577"], ["近期", "#E8743B"]];
  let lx = padL;
  legend.forEach(([lab, col]) => {
    svg.appendChild(svgEl("rect", { x: lx, y: 8, width: 9, height: 9, rx: 2, fill: col }));
    const t = svgEl("text", { x: lx + 14, y: 16, "font-size": 10, fill: "#c8ccd4" });
    t.textContent = lab; svg.appendChild(t);
    lx += 14 + lab.length * 10 + 14;
  });
  container.innerHTML = "";
  container.appendChild(svg);
}

function drawLineChart(container, series, { yMax = 100, unit = "%", padB = 26 } = {}) {
  const W = 340, H = 220, padL = 34, padR = 10, padT = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = series[0] ? series[0].points.length : 0;
  const xOf = (i) => padL + (n <= 1 ? plotW / 2 : (plotW * (i - 1)) / (n - 1));
  const yOf = (v) => padT + plotH * (1 - v / yMax);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  const step = yMax / 4;
  for (let g = 0; g <= yMax + 0.1; g += step) {
    svg.appendChild(svgEl("line", { x1: padL, y1: yOf(g), x2: W - padR, y2: yOf(g), stroke: "#2c313c", "stroke-width": 1 }));
    const t = svgEl("text", { x: padL - 6, y: yOf(g) + 4, fill: "#9aa0ab", "font-size": 10, "text-anchor": "end" });
    t.textContent = Math.round(g) + unit; svg.appendChild(t);
  }
  series.forEach((s) => {
    if (!s.points.length) return;
    const d = s.points.map((p, i) => (i ? "L" : "M") + xOf(p.x) + " " + yOf(p.y)).join(" ");
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linejoin": "round" }));
    s.points.forEach((p) => svg.appendChild(svgEl("circle", { cx: xOf(p.x), cy: yOf(p.y), r: 3, fill: s.color })));
  });
  let lx = padL;
  const ly = H - 6;
  series.forEach((s) => {
    const g = svgEl("g", {});
    g.appendChild(svgEl("rect", { x: lx, y: ly - 8, width: 8, height: 8, rx: 2, fill: s.color }));
    const t = svgEl("text", { x: lx + 12, y: ly, "font-size": 10, fill: "#c8ccd4" });
    t.textContent = s.name; g.appendChild(t);
    svg.appendChild(g);
    lx += 14 + s.name.length * 9 + 14;
  });
  container.innerHTML = "";
  container.appendChild(svg);
}
function drawBarChart(container, items) {
  const W = 340, H = 220, padL = 34, padR = 10, padT = 12, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yOf = (v) => padT + plotH * (1 - v / 100);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  [0, 25, 50, 75, 100].forEach((g) => {
    svg.appendChild(svgEl("line", { x1: padL, y1: yOf(g), x2: W - padR, y2: yOf(g), stroke: "#2c313c", "stroke-width": 1 }));
    const t = svgEl("text", { x: padL - 6, y: yOf(g) + 4, fill: "#9aa0ab", "font-size": 10, "text-anchor": "end" });
    t.textContent = g + "%"; svg.appendChild(t);
  });
  const gap = plotW / items.length;
  const bw = gap * 0.6;
  items.forEach((it, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    const y = yOf(it.value);
    svg.appendChild(svgEl("rect", { x, y, width: bw, height: padT + plotH - y, rx: 4, fill: it.color }));
    const vt = svgEl("text", { x: x + bw / 2, y: y - 6, fill: "#c8ccd4", "font-size": 11, "text-anchor": "middle", "font-weight": "700" });
    vt.textContent = it.value + "%"; svg.appendChild(vt);
    const lt = svgEl("text", { x: x + bw / 2, y: H - padB + 16, fill: "#c8ccd4", "font-size": 10, "text-anchor": "middle" });
    lt.textContent = it.label; svg.appendChild(lt);
  });
  container.innerHTML = "";
  container.appendChild(svg);
}

/* ================= 导出 / 导入 ================= */
const CSV_HEADER = ["日期", "点位", "投篮动作", "进球", "出手", "时长", "命中率"];
function recordsToCSV(recs) {
  const rows = recs.map((r) => {
    const rate = r.attempted > 0 ? Math.round((r.made / r.attempted) * 100) : 0;
    return [r.date, r.spot, r.move, r.made, r.attempted, r.duration, rate].join(",");
  });
  return "﻿" + CSV_HEADER.join(",") + "\r\n" + rows.join("\r\n") + "\r\n";
}
function parseCSV(text) {
  // 处理 BOM、引号、换行
  const t = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x.trim() !== ""));
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById("export-csv-btn").addEventListener("click", async () => {
  const recs = await getRecords();
  if (recs.length === 0) { toast("还没有数据可导出"); return; }
  const ts = new Date().toISOString().slice(0, 10);
  download(`三分训练-${ts}.csv`, recordsToCSV(recs), "text/csv;charset=utf-8");
  toast("已导出 Excel (CSV)，去「文件」App 存到 iCloud");
});
document.getElementById("import-csv-btn").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    let cnt = 0;
    if (file.name.toLowerCase().endsWith(".json")) {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.records || [];
      for (const r of list) {
        if (typeof r.spot !== "string" || typeof r.made !== "number") continue;
        await addRecord({
          date: r.date || new Date().toISOString().slice(0, 10),
          spot: r.spot, move: r.move || MOVES[0],
          made: +r.made || 0, attempted: +r.attempted || 0, duration: +r.duration || 0,
          createdAt: r.createdAt || Date.now(),
        });
        cnt++;
      }
    } else {
      const rows = parseCSV(text);
      const header = rows[0] || [];
      const idx = {};
      header.forEach((h, i) => (idx[h.trim()] = i));
      const col = (row, names) => {
        for (const nm of names) if (idx[nm] != null && row[idx[nm]] != null) return row[idx[nm]].trim();
        return "";
      };
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const spot = col(row, ["点位", "spot"]);
        const made = parseInt(col(row, ["进球", "made"]), 10);
        const att = parseInt(col(row, ["出手", "attempted"]), 10);
        if (!spot || isNaN(made) || isNaN(att)) continue;
        await addRecord({
          date: col(row, ["日期", "date"]) || new Date().toISOString().slice(0, 10),
          spot,
          move: col(row, ["投篮动作", "move"]) || MOVES[0],
          made, attempted: att,
          duration: parseInt(col(row, ["时长", "duration"]), 10) || 0,
          createdAt: Date.now() + i,
        });
        cnt++;
      }
    }
    toast(`已导入 ${cnt} 条记录`);
    renderOverview();
  } catch (err) {
    alert("导入失败：" + err.message);
  }
  e.target.value = "";
});

/* ================= JSON 全量备份 / 恢复 ================= */
/* 把全部训练记录序列化为 JSON 文件下载，换手机 / 清缓存时可整体恢复，避免数据丢失 */
document.getElementById("export-json-btn").addEventListener("click", async () => {
  const recs = await getRecords();
  if (recs.length === 0) { toast("还没有数据可备份"); return; }
  const ts = new Date().toISOString().slice(0, 10);
  // 输出全部字段，保留 missAngles / createdAt / id，便于完整恢复
  const payload = recs.map((r) => ({
    date: r.date,
    spot: r.spot,
    move: r.move,
    made: r.made,
    attempted: r.attempted,
    duration: r.duration,
    missAngles: Array.isArray(r.missAngles) ? r.missAngles : [],
    createdAt: r.createdAt,
    id: r.id,
  }));
  download(`三分训练-备份-${ts}.json`, JSON.stringify({ records: payload }, null, 2), "application/json;charset=utf-8");
  toast("已导出备份 (JSON)，去「文件」App 存到 iCloud");
});
document.getElementById("import-json-btn").addEventListener("click", () => document.getElementById("import-json-file").click());
document.getElementById("import-json-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // 兼容直接数组或 { records: [...] } 两种格式
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.records) ? data.records : []);
    let cnt = 0;
    for (const r of list) {
      // 仅恢复字段合法的记录；spot 必须为字符串、made 必须为数字
      if (!r || typeof r.spot !== "string" || typeof r.made !== "number") continue;
      await addRecord({
        date: r.date || new Date().toISOString().slice(0, 10),
        spot: r.spot,
        move: r.move || MOVES[0],
        made: +r.made || 0,
        attempted: +r.attempted || 0,
        duration: +r.duration || 0,
        missAngles: Array.isArray(r.missAngles) ? r.missAngles : [],
        createdAt: r.createdAt || Date.now(),
      });
      cnt++;
    }
    toast(`已恢复 ${cnt} 条记录`);
    renderOverview();
  } catch (err) {
    alert("导入备份失败：" + err.message);
  }
  e.target.value = "";
});

/* ================= 初始化 ================= */
/* 首次打开自动注入种子数据（仅当数据库为空），保证一进来分析页就有数据 */
(async function autoSeed() {
  try {
    const recs = await getRecords();
    if (recs.length === 0) {
      const DATE = "2026-08-21";
      // 含 missAngles：按各点位篮板朝向给出有偏向的打框样本，方便分析页投失热力图直接出图
      const SEED = [
        { spot: "左底角", made: 10, attempted: 26, missAngles: [60, 75, 90, 80, 100, 70, 110, 85, 95, 78, 88, 65, 102, 72, 92, 82] },
        { spot: "左翼45°", made: 10, attempted: 30, missAngles: [30, 40, 50, 35, 45, 25, 55, 20, 38, 48, 33, 42, 28, 52, 36, 46, 31, 44, 26, 49] },
        { spot: "弧顶", made: 10, attempted: 22, missAngles: [350, 355, 0, 5, 10, 345, 15, 352, 358, 3, 8, 348] },
        { spot: "右翼45°", made: 10, attempted: 32, missAngles: [320, 330, 340, 310, 350, 325, 335, 300, 328, 342, 315, 338, 322, 332, 345, 312, 318, 348, 326, 340, 308, 352] },
        { spot: "右底角", made: 10, attempted: 28, missAngles: [260, 275, 290, 270, 250, 285, 295, 265, 278, 255, 288, 268, 262, 282, 272, 258, 292, 248] },
      ];
      const base = Date.parse(DATE + "T21:00:00");
      for (let i = 0; i < SEED.length; i++) {
        const s = SEED[i];
        await addRecord({ date: DATE, spot: s.spot, move: "常规训练", made: s.made, attempted: s.attempted, duration: 0, missAngles: s.missAngles, createdAt: base + i * 60000 });
      }
      renderOverview();
    }
  } catch (e) { console.warn("auto-seed 失败:", e); }
})();
showCourt();
renderOverview();

/* 注册 Service Worker：让 App 离线可用、并可「安装到主屏幕」 */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service Worker 注册失败（不影响正常使用）:", err.message);
    });
  });
}

/* ================= iOS 安装引导提示条 ================= */
/* 仅在 iOS Safari 且尚未「添加到主屏幕」时显示；点「知道了」后用 localStorage 记住 */
function initIOSTip() {
  const tip = document.getElementById("ios-tip");
  if (!tip) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  const installed = window.navigator.standalone === true;
  if (isIOS && isHttp && !installed && localStorage.getItem("tpt_ios_tip") !== "1") {
    tip.hidden = false;
  }
  const ok = document.getElementById("ios-tip-ok");
  if (ok) {
    ok.addEventListener("click", () => {
      tip.hidden = true;
      try { localStorage.setItem("tpt_ios_tip", "1"); } catch (e) {}
    });
  }
}
initIOSTip();
