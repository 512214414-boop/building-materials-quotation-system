> **v9.0 收敛声明**：本文为历史检查清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Checklist

## 注释清理验证

- [ ] `documentService.ts` 头部「唯一逻辑轴心」指向 v8.0 文档（无 `spec.md` 引用）
- [ ] `documentService.ts` 3 处 `variant 关系已删除` 注释改为 `brand + unitLink 实时档案（spec 已并入 SPU）`
- [ ] `documentService.ts` 1 处 `（原 brandSeriesId）` 括注移除
- [ ] `validation.ts` 头部「唯一逻辑轴心」指向 v8.0 文档（无 `spec.md` 引用）
- [ ] `validation.ts` 2 处 `（原 brandSeriesId）` 括注移除
- [ ] `staff.ts` 3 处 v7.1 引用（`v7.1 brand_series` / `spec 已移除` / `brand_spec_rel 已移除`）改为 v8.0 正向描述
- [ ] `productController.ts` 头部「v8.0 相对 v7.1 的根本性调整」整段删除
- [ ] `productController.ts` 头部设计原则中 `brand_series → brand` / `brandName+seriesName` / `移除 spec 表` / `（无 specId）` 等 v7.1 对照表述全部改写为 v8.0 正向描述
- [ ] `productController.ts` 2 处 `（无 specId）` 括注移除
- [ ] `productService.ts` 头部设计原则中同上 v7.1 对照表述全部改写为 v8.0 正向描述
- [ ] `productService.ts` 2 处 `（无 specId）` 括注移除

## 全局残留扫描验证

- [ ] 执行 `grep -rn "brandSeriesId\|brand_series\|brand_spec_rel\|BrandSeriesView\|SpecView" backend/src/` 无业务代码注释残留（schema.prisma 头部变更日志除外）
- [ ] 执行 `grep -rn "（原 brandSeriesId）\|（无 specId）\|variant 关系已删除\|brandName+seriesName" backend/src/` 无匹配
- [ ] 执行 `grep -rn "spec\.md" backend/src/` 无匹配（v7.1 旧 spec 文档引用全部清除）

## 编译验证

- [ ] `cd /Users/mac/Desktop/建材报价系统/backend && npx tsc --noEmit` 退出码 0，无任何错误
