/**
 * 像素级列宽对比工具：对比点击前/点击后两张截图，找出「产品名称/规格」列宽度变化
 * 用法: node analyze_cols.js <before.png> <after.png>
 * 原理：两张截图应来自同一手机同一位置，通过对比表格竖线（border）位置的像素差异
 *      精确定位各列边界，输出列宽数组，判断产品列是否收缩。
 */
const fs = require('fs');
const { PNG } = require('pngjs');
const [,, beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('用法: node analyze_cols.js <before.png> <after.png>');
  process.exit(1);
}

function loadPng(p) {
  const buf = fs.readFileSync(p);
  return PNG.sync.read(buf);
}

// 检测一行中所有「垂直分隔线」x 坐标（列边界）
// 竖线判据：该列像素与相邻列像素颜色差异显著（表格边框色）
function findVerticalBorders(img, rowRatio) {
  const { width, height, data } = img;
  const y = Math.floor(height * rowRatio);
  const borders = [];
  for (let x = 1; x < width - 1; x++) {
    const idx = (y * width + x) * 4;
    const prevIdx = (y * width + x - 1) * 4;
    // 比较当前像素与其左侧像素
    const dr = Math.abs(data[idx] - data[prevIdx]);
    const dg = Math.abs(data[idx + 1] - data[prevIdx + 1]);
    const db = Math.abs(data[idx + 2] - data[prevIdx + 2]);
    if (dr + dg + db > 60) {
      // 记录连续差异区域的起点
      if (borders.length === 0 || x - borders[borders.length - 1].end > 1) {
        borders.push({ start: x, end: x, max: dr + dg + db });
      } else {
        borders[borders.length - 1].end = x;
        borders[borders.length - 1].max = Math.max(borders[borders.length - 1].max, dr + dg + db);
      }
    }
  }
  return borders.map((b) => ({ x: Math.round((b.start + b.end) / 2), w: b.end - b.start, max: b.max }));
}

// 分析表头区域（通常在前 20% 高度），找到各列边界
function analyze(img, label) {
  const { width, height } = img;
  console.log(`\n=== ${label}: ${width}x${height} ===`);
  // 表头通常在 y 5%~25%
  for (const ratio of [0.08, 0.12, 0.16, 0.2]) {
    const borders = findVerticalBorders(img, ratio);
    // 过滤太短的边界（表格竖线应有一定高度，这里用单行采样，先看分布）
    const xs = borders.filter((b) => b.w <= 4).map((b) => b.x);
    console.log(`y=${Math.floor(height * ratio)} 列边界x:`, JSON.stringify(xs.slice(0, 20)));
  }
}

const b = loadPng(beforePath);
const a = loadPng(afterPath);
analyze(b, '点击前');
analyze(a, '点击后');
console.log('\n提示：对比两个图在表头高度的列边界 x 坐标列表，若 after 的产品列边界明显左移（列宽变窄），即为问题所在。');
