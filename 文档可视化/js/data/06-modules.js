/**
 * DOC_VIZ.modules
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 1172-1177 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.modules = DOC_VIZ.navGroups.reduce(function (acc, g) {
  g.items.forEach(function (m) {
    if (m.enabled) acc.push(m);
  });
  return acc;
}, []);
