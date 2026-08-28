#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
顶层设计驱动文档治理 · 扫描器

扫描文档树，自动初筛四类病灶：膨胀 / 断链 / 越权 / 重复。
纯标准库，无依赖。

用法:
    python3 scan_docs.py --root "<文档根目录>"
默认扫描 ./用户项目开发文档。
输出 Markdown 报告到 stdout，并写一份到 <root>/_治理报告_YYYYMMDD.md
"""

import os
import re
import sys
import argparse
import datetime
from collections import defaultdict

# ---------- 配置 ----------
EXPANSION_WARN = 300      # 其余文档预警线
EXPANSION_CRIT = 500      # 其余文档严重线
ARCH_PRINCIPLE_CAP = 300  # 架构原则硬上限

# 架构级目录（这些目录下的文档禁止写实现细节）
ARCH_DIRS = {"架构原则", "顶层设计规范.md", "项目设计哲学.md"}

# 越权检测：架构级文档出现以下特征即疑似写了实现细节
IMPL_PATTERNS = [
    (re.compile(r"\b(function|const|let|var|import|export|return|await|async)\b"), "JS 关键字"),
    (re.compile(r"=>"), "箭头函数"),
    (re.compile(r"\.\w*(tsx?|vue|css|scss|less)\b"), "源码文件引用"),
    (re.compile(r"\b(px|rem|vh|vw|em)\b"), "像素/尺寸值"),
    (re.compile(r"rgba?\s*\("), "CSS 颜色函数"),
    (re.compile(r"(class|className|component)\s*=\s*[\"'\w-]"), "组件/类名"),
    (re.compile(r"/[\w./-]+\.(ts|tsx|js|vue|css|scss)"), "文件路径"),
    (re.compile(r"@\w[\w-]*\b"), "装饰符/注解"),
]
FENCE_RE = re.compile(r"```")

# 顶层抽象基名（用于溯源判定）
TOP_ABSTRACT = {"项目设计哲学", "顶层设计规范"}          # 最顶层：为什么 + 理念
TOP_DOCS = {"项目设计哲学", "顶层设计规范", "术语表", "架构原则"}
# 架构原则短名（功能文档常以短名引用，如《数据规范》）
ARCH_NAMES = {
    "代码与工程规范", "共享组件与公共能力", "导航与路由规范", "数据规范",
    "文档编写规范", "权限与职责规范", "表格与交互规范", "视觉与布局规范",
}
# 目录/骨架类文档：命名文件、展示表骨架是其本职，越权判定需人工放宽
CATALOG_DOCS = {"共享组件与公共能力", "代码与工程规范"}

REF_RE = re.compile(r"《([^》]+)》")          # 提取《文档名》
TOPLEVEL_FILES = {"项目设计哲学.md", "顶层设计规范.md", "术语表.md", "README.md"}


def classify(rel):
    parts = rel.split(os.sep)
    top = parts[0]
    if top in ARCH_DIRS and top.endswith(".md") is False:
        return "架构原则"
    if top == "功能文档":
        return "功能文档"
    if top == "技术架构":
        return "技术架构"
    if top == "AI协作":
        return "AI协作"
    if top == "产品数据形式":
        return "产品数据形式"
    if rel in TOPLEVEL_FILES:
        return "顶层"
    if rel in ("AI协作/AI协作指南.md",):
        return "AI协作"
    return "其他"


def read_lines(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().splitlines()
    except Exception:
        return []


def doc_basename(rel):
    """《文档名·章节》 -> 文档基名（取 · 前，不带扩展名）"""
    base = os.path.basename(rel)
    base = re.sub(r"\.md$", "", base)
    return base


# 导航/合成/自动生成类文档：不参与"断链源 / 孤儿"判定（其引用多为提案性或概括性）
SKIP_PREFIXES = ("_治理报告_", "_代码事实_")
SKIP_BASENAMES = ("系统全景",)  # 系统全景.md / 文档洞察记录（分析合成类，不参与断链/孤儿判定）
def is_skip_doc(rel, fn):
    if fn.startswith(SKIP_PREFIXES):
        return True
    base = doc_basename(rel)
    if base in SKIP_BASENAMES or base.startswith("文档归并提议") or base.startswith("文档洞察记录"):
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="./用户项目开发文档")
    args = ap.parse_args()
    root = args.root
    if not os.path.isdir(root):
        # 尝试相对当前工作目录
        print(f"目录不存在: {root}", file=sys.stderr)
        sys.exit(1)

    md = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith(".md") and not is_skip_doc(os.path.relpath(os.path.join(dp, fn), root), fn):
                full = os.path.join(dp, fn)
                rel = os.path.relpath(full, root)
                md.append((rel, full, doc_basename(rel)))
    md.sort()

    # 已知文档基名集合（用于解析《》引用）
    known_bases = {b for (_, _, b) in md}

    # ---------- 收集 ----------
    layers = defaultdict(list)
    line_counts = {}
    ref_graph = defaultdict(set)      # doc base -> 引用的 doc base 集合
    backrefs = defaultdict(set)       # doc base -> 被谁引用
    impl_hits = defaultdict(list)    # arch doc -> [(line_no, 特征)]
    fence_counts = defaultdict(int)   # arch doc -> 代码块数
    significant_lines = {}            # base -> set(归一化行)

    for rel, full, base in md:
        layer = classify(rel)
        layers[layer].append((rel, base))
        lines = read_lines(full)
        line_counts[base] = len(lines)

        text = "\n".join(lines)
        refs = REF_RE.findall(text)
        ref_targets = set()
        for r in refs:
            tgt = r.split("·")[0].strip()
            tgt = re.sub(r"\.md$", "", tgt)
            if tgt and tgt != base:
                ref_targets.add(tgt)
        ref_graph[base] = ref_targets
        for t in ref_targets:
            backrefs[t].add(base)

        # 越权检测（仅架构级）
        if layer == "架构原则":
            for i, ln in enumerate(lines, 1):
                if FENCE_RE.search(ln):
                    fence_counts[base] += 1
                    continue
                for pat, label in IMPL_PATTERNS:
                    if pat.search(ln):
                        impl_hits[base].append((i, label, ln.strip()[:80]))
                        break

        # 显著行（去重检测用）
        sig = set()
        for ln in lines:
            s = ln.strip()
            if len(s) < 18:
                continue
            if s.startswith("#") or s.startswith(">"):
                continue
            sig.add(s)
        significant_lines[base] = sig

    # ---------- 报告 ----------
    today = datetime.date.today().strftime("%Y%m%d")
    out = []
    w = out.append
    w(f"# 文档治理报告 · {today}")
    w("")
    w("> 自动初筛：膨胀 / 断链 / 越权 / 重复。人工判定见 `references/inspection-checklist.md`。")
    w("")
    w("## 一、概览")
    w("")
    total = len(md)
    total_lines = sum(line_counts.values())
    w(f"- 文档总数：**{total}** 份，总行数：**{total_lines}**")
    w("")
    w("| 层级 | 份数 |")
    w("|------|------|")
    for layer in ["顶层", "架构原则", "功能文档", "技术架构", "AI协作", "产品数据形式", "其他"]:
        if layers.get(layer):
            w(f"| {layer} | {len(layers[layer])} |")
    w("")

    # ---------- 二、膨胀 ----------
    w("## 二、膨胀预警")
    w("")
    exp = []
    for rel, full, base in md:
        n = line_counts[base]
        layer = classify(rel)
        cap = ARCH_PRINCIPLE_CAP if layer == "架构原则" else EXPANSION_WARN
        crit = EXPANSION_CRIT if layer != "架构原则" else ARCH_PRINCIPLE_CAP
        if layer == "架构原则" and n > cap:
            exp.append((rel, base, n, "严重(超硬上限300)"))
        elif n > crit:
            exp.append((rel, base, n, "严重(>500)"))
        elif n > cap:
            exp.append((rel, base, n, "预警(>300)"))
    if exp:
        w("| 文档 | 行数 | 级别 |")
        w("|------|------|------|")
        for rel, base, n, lvl in sorted(exp, key=lambda x: -x[2]):
            w(f"| {rel} | {n} | {lvl} |")
    else:
        w("✅ 未发现明显膨胀。")
    w("")

    # ---------- 三、越权 ----------
    w("## 三、越权预警（架构级文档写了实现细节）")
    w("")
    w("> 判定口径：架构级文档禁止写实现细节（组件名/函数名/代码片段/CSS/像素值/文件路径/接口签名）。")
    w("> 代码块（```）单独计数——骨架/示例常合理；目录类文档（共享组件与公共能力、代码与工程规范）命名文件属本职，需人工放宽。以下为命中「实现细节特征」的行，请重点看是否 dumping 真实实现逻辑。")
    w("")
    if impl_hits:
        for base, hits in sorted(impl_hits.items()):
            note = "（目录类文档，命名文件属本职，放宽）" if base in CATALOG_DOCS else ""
            w(f"### {base}（实现细节特征 {len(hits)} 处，代码块 {fence_counts.get(base,0)} 个）{note}")
            for ln, label, snippet in hits[:12]:
                w(f"- L{ln} [{label}] `{snippet}`")
            if len(hits) > 12:
                w(f"- … 其余 {len(hits)-12} 处省略")
            w("")
    else:
        w("✅ 架构级文档未命中实现细节特征。")
    w("")

    # ---------- 四、断链 / 溯源 ----------
    w("## 四、溯源与断链")
    w("")
    w("### 4.1 功能文档是否锚定顶层抽象")
    w("")
    w("| 功能文档 | 锚定最顶层(哲学/规范) | 锚定架构原则 | 引用了谁 |")
    w("|----------|----------------------|------------|---------|")
    for rel, base in layers.get("功能文档", []):
        refs = ref_graph[base]
        top_refs = [r for r in refs if r in TOP_ABSTRACT]
        arch_refs = [r for r in refs if r in ARCH_NAMES]
        top_mark = "✅ " + ", ".join(top_refs) if top_refs else "❌"
        arch_mark = "✅ " + ", ".join(arch_refs) if arch_refs else "❌"
        w(f"| {rel} | {top_mark} | {arch_mark} | {', '.join(sorted(refs)) or '（无引用）'} |")
    w("")
    missing = [rel for rel, base in layers.get("功能文档", []) if not (set(ref_graph[base]) & TOP_ABSTRACT)]
    if missing:
        w(f"> 解读：仍有 {len(missing)} 份功能文档未回溯最顶层（项目设计哲学 / 顶层设计规范）：{', '.join(missing)}。建议补「顶层依据」锚点句。")
    else:
        w("> ✅ 全部功能文档均已回溯最顶层（项目设计哲学 / 顶层设计规范），顶层↔细节关系已显式建立。")
    w("")
    w("### 4.2 断链引用（《》指向不存在的文档）")
    w("")
    broken = []
    for base, refs in ref_graph.items():
        for r in refs:
            if r not in known_bases and r not in TOP_DOCS:
                broken.append((base, r))
    if broken:
        w("| 引用方 | 指向 |")
        w("|--------|------|")
        for base, r in broken:
            w(f"| {base} | 《{r}》 |")
    else:
        w("✅ 未发现断链引用。")
    w("")
    w("### 4.3 孤儿文档（无任何引用、也不被引用）")
    w("")
    STRUCTURAL_DIRS = {"AI协作", "技术架构"}
    orphans = []
    for rel, full, base in md:
        if base in TOP_DOCS or base in ("README",):
            continue
        if rel.split(os.sep)[0] in STRUCTURAL_DIRS:
            continue  # 结构性/元文档由 README 与任务书索引，不要求互引
        if not ref_graph[base] and not backrefs.get(base):
            orphans.append(rel)
    if orphans:
        for rel in orphans:
            w(f"- {rel}")
    else:
        w("✅ 未发现孤儿文档。")
    w("> 注：AI协作 / 技术架构 为结构性元文档，由 README 与任务书索引，不计入孤儿。")
    w("")

    # ---------- 五、重复 ----------
    w("## 五、重复检测（显著行 Jaccard > 0.4）")
    w("")
    bases = list(significant_lines.keys())
    dups = []
    for i in range(len(bases)):
        for j in range(i + 1, len(bases)):
            a, b = bases[i], bases[j]
            sa, sb = significant_lines[a], significant_lines[b]
            if not sa or not sb:
                continue
            inter = len(sa & sb)
            union = len(sa | sb)
            jac = inter / union if union else 0
            if jac > 0.4 and inter >= 3:
                dups.append((a, b, round(jac, 2), inter))
    if dups:
        w("| 文档A | 文档B | 相似度 | 共有显著行 |")
        w("|-------|-------|--------|-----------|")
        for a, b, jac, inter in sorted(dups, key=lambda x: -x[2]):
            w(f"| {a} | {b} | {jac} | {inter} |")
    else:
        w("✅ 未发现高重复文档对。")
    w("")

    # ---------- 六、综合建议 ----------
    w("## 六、综合建议")
    w("")
    score_notes = []
    if exp:
        score_notes.append(f"膨胀 {len(exp)} 处")
    if impl_hits:
        score_notes.append(f"越权 {sum(len(v) for v in impl_hits.values())} 处")
    if broken:
        score_notes.append(f"断链 {len(broken)} 处")
    orphans_func = [r for r in orphans if r.startswith('功能文档')]
    if orphans_func:
        score_notes.append(f"孤儿 {len(orphans_func)} 处")
    if dups:
        score_notes.append(f"重复 {len(dups)} 对")
    if score_notes:
        w("发现待处理项：" + "、".join(score_notes) + "。")
        w("")
        w("下一步：")
        w("1. 按 `references/inspection-checklist.md` 人工判定是否真问题；")
        w("2. 断链/越权优先整改（破坏顶层↔细节关系）；")
        w("3. 整改后更新 `溯源映射.md`，保持《文档编写规范》铁则。")
    else:
        w("✅ 本次扫描未发现四类病灶，文档体系健康。")
    w("")

    report = "\n".join(out)
    print(report)

    # 写回文件
    try:
        path = os.path.join(root, f"_治理报告_{today}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"\n[已写入报告] {path}", file=sys.stderr)
    except Exception as e:
        print(f"[写报告失败] {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
