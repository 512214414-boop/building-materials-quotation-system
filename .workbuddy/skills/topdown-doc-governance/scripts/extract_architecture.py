#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_architecture.py — 代码事实提取器（顶层设计文档治理 · Phase ③）

纯标准库。扫描真实代码，提取"代码事实"用于文档对齐与向上抽象重组：
  - 前端路由/页面、关键复用组件与面板抽象、设计令牌、共享能力注册表
  - 后端业务模块、API 前缀、引擎
  - Prisma 数据实体

输出 Markdown 到 stdout，并写 <root>/_代码事实_YYYYMMDD.md

用法：
  python3 extract_architecture.py --root /path/to/项目根
  python3 extract_architecture.py --frontend .../frontend/src --backend .../backend/src --schema .../schema.prisma
"""
import argparse
import os
import re
import sys
from datetime import date
from pathlib import Path

KNOWN_PANELS = [
    "UnifiedTable", "EntityPanel", "DictRefField", "RecordExpandPanel",
    "UnitPriceExpandPanel", "PriceChoicePanel", "DictListPanel", "ViewFrame",
    "SharedBadgeOverlay", "DataViewLayer", "InteractionLayer", "CellEditor",
]
KNOWN_ENGINES = ["pricing-engine", "document-state-machine", "search-engine", "full-name-generator"]


def find_dir(root, *candidates):
    for c in candidates:
        p = root / c
        if p.exists():
            return p
    return None


def scan_frontend(fe: Path):
    out = {"routes": [], "pages": [], "panels": [], "tokens": [], "shared": []}
    if not fe or not fe.exists():
        return out
    # 路由：匹配引号内的路径串，常见 /login /staff/... /customer/...
    route_re = re.compile(r"['\"](/(?:login|staff|customer|system|api)[A-Za-z0-9_/:.\-]*)['\"]")
    route_files = list(fe.rglob("App.tsx")) + list(fe.rglob("menu.config.ts")) + list(fe.rglob("routes*.ts"))
    seen = set()
    for f in route_files:
        try:
            txt = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in route_re.findall(txt):
            if m not in seen:
                seen.add(m)
                out["routes"].append(m)
    out["routes"].sort()
    # 页面组件文件：apps/**/pages/**/*.tsx
    for f in fe.rglob("*.tsx"):
        rel = f.relative_to(fe).as_posix()
        if "/pages/" in rel or rel.endswith("Login.tsx"):
            out["pages"].append(rel)
    out["pages"].sort()
    # 面板/复用组件：shared/components 顶层 + 命中已知抽象名
    comp_root = find_dir(fe, "shared/components", "components")
    if comp_root:
        for f in sorted(comp_root.rglob("*.tsx")):
            name = f.stem
            if name in KNOWN_PANELS:
                out["panels"].append(f.relative_to(fe).as_posix())
        # shared 能力注册表
        for f in comp_root.rglob("registry.ts"):
            out["shared"].append(f.relative_to(fe).as_posix())
    # 设计令牌
    for pat in ("tokens.css", "antd-theme.ts", "colWidths.ts", "shell-constants.ts", "recordDicts.ts"):
        for f in fe.rglob(pat):
            out["tokens"].append(f.relative_to(fe).as_posix())
    return out


def scan_backend(be: Path):
    out = {"modules": [], "apis": [], "engines": []}
    if not be or not be.exists():
        return out
    # 模块：从 controller/service 文件名推导（backend 是平铺文件，非子目录）
    for d in ("controllers", "services"):
        dd = be / d
        if dd.exists():
            for f in sorted(dd.iterdir()):
                if f.is_file() and f.suffix == ".ts":
                    mod = re.sub(r"(Controller|Service)$", "", f.stem, flags=re.I)
                    out["modules"].append(f"{d}/{mod}")
    seen_m = set()
    out["modules"] = [m for m in out["modules"] if not (m in seen_m or seen_m.add(m))]
    # API：挂载前缀 app.use('/api/...') + 路由定义 router.METHOD('...'/`.ts`)（支持反引号模板串）
    mount_re = re.compile(r"""app\.use\(\s*['"](/api(?:/[A-Za-z0-9_/\-]*)?)['"]""")
    route_re = re.compile(r"""router\.(?:get|post|put|delete|patch)\(\s*[`'\"](/[A-Za-z0-9_/:.\-{}]*)['`]""")
    seen = set()
    for f in be.rglob("*.ts"):
        rel = f.relative_to(be).as_posix()
        if rel.startswith("routes/") or rel.endswith("app.ts") or rel.endswith("router.ts"):
            try:
                txt = f.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for m in mount_re.findall(txt):
                if m not in seen:
                    seen.add(m)
                    out["apis"].append(m)
            for m in route_re.findall(txt):
                if m not in seen:
                    seen.add(m)
                    out["apis"].append(m)
    out["apis"].sort()
    # 引擎（平铺 .ts 文件）
    eng = be / "engines"
    if eng.exists():
        for f in sorted(eng.iterdir()):
            if f.is_file() and f.suffix == ".ts":
                out["engines"].append(f.stem)
    return out


def scan_prisma(schema: Path):
    models = []
    enums = []
    if not schema or not schema.exists():
        return models, enums
    txt = schema.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r"^\s*model\s+(\w+)", txt, re.M):
        models.append(m.group(1))
    for m in re.finditer(r"^\s*enum\s+(\w+)", txt, re.M):
        enums.append(m.group(1))
    return models, enums


def render(fe_out, be_out, models, enums, root: Path):
    lines = []
    w = lines.append
    w(f"# 代码事实（{date.today().isoformat()}）")
    w("")
    w("> 由 `extract_architecture.py` 自动提取，供文档对齐与向上抽象重组使用。本文是事实底座，不承载规则。")
    w("")
    w("## 一、前端")
    w("")
    w(f"### 路由/页面（{len(fe_out['routes'])} 条）")
    w("")
    for r in fe_out["routes"]:
        w(f"- `{r}`")
    w("")
    w(f"### 关键复用组件 / 面板抽象（命中已知抽象 {len(fe_out['panels'])} 个）")
    w("")
    for p in fe_out["panels"]:
        w(f"- `{p}`")
    if not fe_out["panels"]:
        w("- （未在 shared/components 直接命中已知面板名，可能需人工核对）")
    w("")
    w("### 共享能力注册表 / 设计令牌")
    w("")
    for s in sorted(set(fe_out["shared"] + fe_out["tokens"])):
        w(f"- `{s}`")
    w("")
    w("## 二、后端")
    w("")
    w(f"### 业务模块（{len(be_out['modules'])} 个）")
    w("")
    for m in be_out["modules"]:
        w(f"- `{m}`")
    w("")
    w(f"### API 前缀（{len(be_out['apis'])} 条，节选前 40）")
    w("")
    for a in be_out["apis"][:40]:
        w(f"- `{a}`")
    if len(be_out["apis"]) > 40:
        w(f"- … 其余 {len(be_out['apis'])-40} 条省略")
    w("")
    w(f"### 引擎（{len(be_out['engines'])} 个）")
    w("")
    for e in be_out["engines"]:
        w(f"- `{e}`")
    w("")
    w("## 三、数据实体（Prisma，{0} 个 model / {1} 个 enum）".format(len(models), len(enums)))
    w("")
    w("### model")
    w("")
    for m in models:
        w(f"- `{m}`")
    w("")
    w("### enum（状态机约束，节选前 30）")
    w("")
    for e in enums[:30]:
        w(f"- `{e}`")
    if len(enums) > 30:
        w(f"- … 其余 {len(enums)-30} 个省略")
    w("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.getcwd(), help="项目根目录（含 frontend/ backend/）")
    ap.add_argument("--frontend", default=None)
    ap.add_argument("--backend", default=None)
    ap.add_argument("--schema", default=None)
    args = ap.parse_args()

    root = Path(args.root)
    fe = Path(args.frontend) if args.frontend else find_dir(root, "frontend/src", "frontend")
    be = Path(args.backend) if args.backend else find_dir(root, "backend/src", "backend")
    schema = Path(args.schema) if args.schema else find_dir(root, "backend/prisma/schema.prisma", "prisma/schema.prisma")
    if be and not schema:
        schema = be.parent / "prisma" / "schema.prisma" if (be.parent / "prisma" / "schema.prisma").exists() else None

    fe_out = scan_frontend(fe)
    be_out = scan_backend(be)
    models, enums = scan_prisma(schema)
    md = render(fe_out, be_out, models, enums, root)
    sys.stdout.write(md + "\n")

    # 写报告
    try:
        doc_root = root / "用户项目开发文档"
        if not doc_root.exists():
            doc_root = root
        out_path = doc_root / f"_代码事实_{date.today().strftime('%Y%m%d')}.md"
        out_path.write_text(md + "\n", encoding="utf-8")
        sys.stderr.write(f"[ok] 代码事实已写：{out_path}\n")
    except Exception as e:
        sys.stderr.write(f"[warn] 写报告失败：{e}\n")


if __name__ == "__main__":
    main()
