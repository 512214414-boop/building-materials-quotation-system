/**
 * 像素级列宽对比 v2：精确检测表格各列边界（基于表格行背景色的列分隔）
 * 用法: node analyze_cols2.js <before.png> <after.png>
 * 输出：两张图在多个采样行上的列边界 x 坐标，差分即列宽。
 * 判定：若 after 的产品列右侧边界明显左移（列宽变窄），即为「点击后列宽收缩」证据。
 */
const fs = require('fs');
const { PNG } = require('pngjs');
const [,, beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) { console.error('用法: node analyze_cols2.js <before.png> <after.png>'); process.exit(1); }

function loadPng(p) { return PNG.sync.read(fs.readFileSync(p)); }

// 扫描一行，找出列边界：相邻像素颜色差异大的位置（表格竖线/背景切换）
function rowBorders(img, y, threshold = 40) {
  const { width, height, data } = img;
  if (y >= height) return [];
  const borders = [];
  for (let x = 1; x < width; x++) {
    const i = (y * width + x) * 4;
    const j = ((y * width) + x - 1) * 4;
    const d = Math.abs(data[i] - data[j]) + Math.abs(data[i+1] - data[j+1]) + Math.abs(data[i+2] - data[j+2]);
    if (d > threshold) {
      if (borders.length === 0 || x - borders[borders.length-1].end > 3) {
        borders.push({ start: x, end: x });
      } else {
        borders[borders.length-1].end = x;
      }
    }
  }
  // 返回连续段中心
  return borders.filter(b => (b.end - b.start) <= 3).map(b => Math.round((b.start + b.end) / 2));
}

function analyze(img, label) {
  const { width, height } = img;
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  // 表头区约在 y 5%~15%，数据行约在 y 20%~40%
  for (const ratio of [0.08, 0.1, 0.12, 0.25, 0.35]) {
    const y = Math.floor(height * ratio);
    const borders = rowBorders(img, y);
    console.log(`y=${y}(${Math.round(ratio*100)}%) 边界x:`, JSON.stringify(borders));
  }
}

const b = loadPng(beforePath);
const a = loadPng(afterPath);
analyze(b, '点击前');
analyze(a, '点击后');
console.log('\n判定：比较两图在表头区(y≈10%)的边界列表。点击前产品列左右边界应约为 [x1, x2]，');
console.log('点击后若产品列右边界明显左移（即 x2 变小，列宽 x2-x1 变窄），则确认列宽收缩。');
