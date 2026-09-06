/**
 * signal-lib.mjs — 信号雷达共享库（纯函数，无副作用）
 *
 * 存在理由：
 *   扫描器先前直接拿裸正则在源码上数 `renderMode:'custom'`，两类误判反复出现：
 *     ① 注释里的示例文本被当成真代码（editorRegistry.tsx:238、PurchaseQuote.tsx:59
 *        都是"页面不再手写 renderMode:'custom'"这句**注释**被计成一处逃逸）；
 *     ② 字符串里的 `//`（典型：`'http://x'`）被当行注释，把整行后半段吃掉。
 *   stripComments 把"去掉注释"这件易错的事收敛成唯一实现，并配单测 + 变异验证。
 *
 *   freshnessMeta 则把"报告有多旧"**只记录**进信号报告，供人/AI 判断要不要重跑；
 *   它不参与任何信号判定——那条"报告旧 → 发 HIGH"的判定链已被刻意删除
 *   （原因见 scan-signals.mjs：两进程独立、verify 跑 90s，时序同步不可能可靠）。
 *
 * 约定：本模块不 import 任何业务模块，不写文件，便于单测直接引用。
 */

import fs from 'node:fs';

/** 默认陈旧阈值：24 小时 */
export const DEFAULT_STALE_AFTER_MS = 24 * 3600 * 1000;

// ---------- 词法状态（帧）类型 ----------
const CODE = 'code';           // 普通代码上下文
const INTERP = 'interp';       // 模板字符串内的 ${ ... }，按代码解析
const SINGLE = 'single';       // '...'
const DOUBLE = 'double';       // "..."
const TEMPLATE = 'template';   // `...`
const REGEX = 'regex';         // /.../ 正则字面量

/**
 * 出现在这个字符之后，`/` 只可能是正则开头，不可能是除法。
 * 注意刻意**不含** `<` `>` `]`：
 *   - `</Foo>` 的 `</` 会被误判成正则开头，进而吞掉后续整段 JSX；
 *   - `<Foo />` 的 `/>` 由下方 c2 === '>' 短路兜底。
 */
const REGEX_PREV_CHARS = new Set([
  '(', ')', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '\n',
]);

/** 出现在这个关键字之后，`/` 也只可能是正则开头 */
const REGEX_PREV_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw',
]);

/** 正则字面量的最大跨度（防误判时吞掉过多代码） */
const REGEX_MAX_SPAN = 200;

const ID_CHAR = /[A-Za-z0-9_$]/;

const newFrame = (kind, end = -1) => ({ kind, prevChar: '', prevWord: '', depth: 0, end });

/**
 * 判定当前位置的 `/` 是否可以作为正则字面量开头。
 * @param {{prevChar: string, prevWord: string}} frame 当前词法帧
 * @returns {boolean} true = 视为正则开头
 */
function isRegexAllowed(frame) {
  if (!frame.prevChar) return true; // 文件开头
  if (REGEX_PREV_CHARS.has(frame.prevChar)) return true;
  return REGEX_PREV_WORDS.has(frame.prevWord);
}

/**
 * 从 start 起找正则字面量的闭合 `/`（未转义、不在字符类内、不跨行）。
 * @param {string} src 源码
 * @param {number} start 起始下标（开区间，即开头的 `/` 之后）
 * @returns {number} 闭合 `/` 的下标；找不到返回 -1
 */
function findRegexEnd(src, start) {
  let i = start;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') return -1;                       // 正则不能跨行 → 判定为除法
    if (ch === '\\') { i += 2; continue; }
    if (ch === '[') { inClass = true; i += 1; continue; }
    if (ch === ']') { inClass = false; i += 1; continue; }
    if (ch === '/' && !inClass) return i;
    i += 1;
  }
  return -1;
}

/**
 * 剥离 JS/TS 注释（行注释 `//` 与块注释 `/* *\/`），其余内容原样保留。
 *
 * 只做一件事：把注释替换成等长空白（块注释保留换行，行号不漂移）。
 * 字符串、模板字符串、正则字面量的内容**刻意原样保留**——它们是代码不是注释，
 * 且保留后输出长度与输入一致，便于对拍和排查。
 *
 * @param {string} src 源码文本
 * @returns {string} 去掉注释后的文本（长度与输入一致，换行位置不变）
 */
export function stripComments(src = '') {
  if (typeof src !== 'string' || src.length === 0) return '';

  const n = src.length;
  const out = [];
  // 上下文栈：模板字符串的 ${} 内会回到代码上下文，栈负责记住闭合后回到哪儿
  const stack = [newFrame(CODE)];
  let i = 0;

  /** 记录"上一个有效字符/词"，供正则 vs 除法判定使用（空白不记录，换行要记录） */
  const notePrev = (ch) => {
    const f = stack[stack.length - 1];
    if (ID_CHAR.test(ch)) {
      f.prevWord = ID_CHAR.test(f.prevChar) ? f.prevWord + ch : ch;
    } else {
      f.prevWord = '';
    }
    f.prevChar = ch;
  };

  while (i < n) {
    const f = stack[stack.length - 1];
    const c = src[i];
    const c2 = i + 1 < n ? src[i + 1] : '';

    // 单/双引号字符串不能跨行：换行即视为未闭合，安全退出，避免后续整片误判
    if ((f.kind === SINGLE || f.kind === DOUBLE) && c === '\n') {
      stack.pop();
      out.push(c);
      i += 1;
      continue;
    }

    if (f.kind === SINGLE || f.kind === DOUBLE) {
      const quote = f.kind === SINGLE ? "'" : '"';
      if (c === '\\') { out.push(src.slice(i, i + 2)); i += 2; continue; }
      out.push(c);
      i += 1;
      if (c === quote) stack.pop();
      continue;
    }

    if (f.kind === TEMPLATE) {
      if (c === '\\') { out.push(src.slice(i, i + 2)); i += 2; continue; }
      if (c === '`') { out.push(c); i += 1; stack.pop(); continue; }
      if (c === '$' && c2 === '{') {
        out.push('${');
        i += 2;
        stack.push(newFrame(INTERP));
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    }

    if (f.kind === REGEX) {
      // 进入本帧前已确认闭合位置与跨度，整段原样保留
      out.push(src.slice(i, f.end + 1));
      i = f.end + 1;
      stack.pop();
      notePrev('/');
      continue;
    }

    // ---------- 以下是 CODE / INTERP 上下文 ----------

    // 行注释
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j += 1;
      out.push(' '.repeat(j - i));
      i = j;
      continue;
    }

    // 块注释（保留换行，其余填空格，保证行号不漂移）
    if (c === '/' && c2 === '*') {
      const buf = [' ', ' '];
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) {
        buf.push(src[j] === '\n' ? '\n' : ' ');
        j += 1;
      }
      if (j + 1 < n) { buf.push(' ', ' '); j += 2; } else { j = n; }
      out.push(buf.join(''));
      i = j;
      continue;
    }

    // 模板插值内的花括号配平
    if (f.kind === INTERP) {
      if (c === '{') { f.depth += 1; out.push(c); notePrev(c); i += 1; continue; }
      if (c === '}') {
        if (f.depth === 0) stack.pop(); else f.depth -= 1;
        out.push(c);
        i += 1;
        continue;
      }
    }

    // 字符串 / 模板字符串：入栈跟踪，内部字符一律不当注释
    if (c === "'" || c === '"' || c === '`') {
      stack.push(newFrame(c === "'" ? SINGLE : c === '"' ? DOUBLE : TEMPLATE));
      out.push(c);
      notePrev(c);
      i += 1;
      continue;
    }

    // 正则字面量（`/>` 是 JSX 自闭合、`/=` 是除赋值，都不是正则）
    if (c === '/' && c2 !== '>' && c2 !== '=' && isRegexAllowed(f)) {
      const end = findRegexEnd(src, i + 1);
      if (end > i + 1 && end - i <= REGEX_MAX_SPAN && !src.slice(i + 1, end).includes(';')) {
        stack.push(newFrame(REGEX, end));
        continue;
      }
      // 找不到合法闭合 → 退化为除法运算符，按普通字符处理
    }

    out.push(c);
    if (!/^\s$/.test(c) || c === '\n') notePrev(c);
    i += 1;
  }

  return out.join('');
}

/**
 * 读取一份 JSON 报告的 freshness（新鲜度）元数据。
 *
 * **只记录，不判定**：调用方不得据此发射信号。历史上"报告比 verify 旧 → 发 HIGH"
 * 的判定造成过假红（扫描与 verify 是两个独立进程，时序同步不可能可靠）。
 *
 * @param {string} reportPath 报告文件绝对路径
 * @param {number} staleAfterMs 超过多少毫秒算陈旧，默认 24 小时
 * @returns {{generatedAt: string|null, ageMs: number|null, stale: boolean, error: string|null}}
 */
export function freshnessMeta(reportPath, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  const threshold = Number.isFinite(staleAfterMs) && staleAfterMs > 0
    ? staleAfterMs
    : DEFAULT_STALE_AFTER_MS;

  let raw = '';
  try {
    raw = fs.readFileSync(reportPath, 'utf8');
  } catch (e) {
    return { generatedAt: null, ageMs: null, stale: true, error: `读取失败：${e && e.message ? e.message : String(e)}` };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { generatedAt: null, ageMs: null, stale: true, error: `JSON 解析失败：${e && e.message ? e.message : String(e)}` };
  }

  const generatedAt = parsed && typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null;
  if (!generatedAt) {
    return { generatedAt: null, ageMs: null, stale: true, error: '报告缺少 generatedAt 字段' };
  }

  const ts = Date.parse(generatedAt);
  if (Number.isNaN(ts)) {
    return { generatedAt, ageMs: null, stale: true, error: `generatedAt 无法解析为时间：${generatedAt}` };
  }

  const ageMs = Date.now() - ts;
  return { generatedAt, ageMs, stale: ageMs > threshold, error: null };
}
