// 订单中心表头级联筛：当前单据所有行 facets，不是全局档案。
// 级联粒度产品→品牌→规格。筛只改变眼前能看见的行，不改整单合计。

import { useCallback, useMemo, useState } from 'react';
import { listDocumentLineFacets } from '../services/api/documentApi.js';
import type { ArchiveListFilterChip } from '../components/archive/ArchiveListFilters.js';
import {
  applyDocumentLineHideFlags,
  documentLinePassesLocks,
  type DocumentLineFacetLocks,
  type DocumentLineFacetRow,
} from '../utils/documentLineFacets.js';

export function useDocumentLineCascadeFilter(documentId: string) {
  const [filterProductId, setFilterProductId] = useState<string | null>(null);
  const [filterProductName, setFilterProductName] = useState('');
  const [filterBrandId, setFilterBrandId] = useState<string | null>(null);
  const [filterBrandName, setFilterBrandName] = useState('');
  const [filterSpecModel, setFilterSpecModel] = useState('');
  const [filterSpecExact, setFilterSpecExact] = useState(true);

  const locks: DocumentLineFacetLocks = useMemo(
    () => ({
      productId: filterProductId,
      productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
      brandId: filterBrandId,
      brandName: !filterBrandId && filterBrandName.trim() ? filterBrandName.trim() : undefined,
      specModel: filterSpecModel.trim() || undefined,
      specExact: filterSpecModel.trim() ? filterSpecExact : undefined,
    }),
    [filterProductId, filterProductName, filterBrandId, filterBrandName, filterSpecModel, filterSpecExact],
  );

  const clearSpecFilter = useCallback(() => {
    setFilterSpecModel('');
    setFilterSpecExact(true);
  }, []);

  const clearBrandFilter = useCallback(() => {
    setFilterBrandId(null);
    setFilterBrandName('');
    setFilterSpecModel('');
    setFilterSpecExact(true);
  }, []);

  const clearProductFilter = useCallback(() => {
    setFilterProductId(null);
    setFilterProductName('');
    setFilterBrandId(null);
    setFilterBrandName('');
    setFilterSpecModel('');
    setFilterSpecExact(true);
  }, []);

  const selectProduct = useCallback((id: string, name: string) => {
    setFilterProductId(id || null);
    setFilterProductName(name);
    setFilterBrandId(null);
    setFilterBrandName('');
    setFilterSpecModel('');
    setFilterSpecExact(true);
  }, []);

  const selectBrand = useCallback((id: string, name: string) => {
    setFilterBrandId(id || null);
    setFilterBrandName(name);
    setFilterSpecModel('');
    setFilterSpecExact(true);
  }, []);

  const selectSpec = useCallback((id: string, name: string) => {
    setFilterSpecModel(name);
    setFilterSpecExact(!!id);
  }, []);

  const fetchProductFacet = useCallback(
    (kw: string) =>
      listDocumentLineFacets(documentId, {
        field: 'product',
        keyword: kw,
      }),
    [documentId],
  );

  const fetchBrandFacet = useCallback(
    (kw: string) =>
      listDocumentLineFacets(documentId, {
        field: 'brand',
        keyword: kw,
        productId: filterProductId ?? undefined,
        productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
      }),
    [documentId, filterProductId, filterProductName],
  );

  const fetchSpecFacet = useCallback(
    (kw: string) =>
      listDocumentLineFacets(documentId, {
        field: 'spec',
        keyword: kw,
        productId: filterProductId ?? undefined,
        productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
        brandId: filterBrandId ?? undefined,
        brandName: !filterBrandId && filterBrandName.trim() ? filterBrandName.trim() : undefined,
      }),
    [documentId, filterProductId, filterProductName, filterBrandId, filterBrandName],
  );

  const filterRows = useCallback(
    <T extends DocumentLineFacetRow>(rows: T[]) => {
      const matched = rows.filter((row) => documentLinePassesLocks(row, locks));
      return applyDocumentLineHideFlags(matched, locks);
    },
    [locks],
  );

  const chips: ArchiveListFilterChip[] = useMemo(() => {
    const list: ArchiveListFilterChip[] = [];
    if (filterProductName) {
      list.push({ key: 'product', label: '产品名', value: filterProductName, onClear: clearProductFilter });
    }
    if (filterBrandName) {
      list.push({ key: 'brand', label: '品牌', value: filterBrandName, onClear: clearBrandFilter });
    }
    if (filterSpecModel) {
      list.push({ key: 'spec', label: '规格', value: filterSpecModel, onClear: clearSpecFilter });
    }
    return list;
  }, [filterProductName, filterBrandName, filterSpecModel, clearProductFilter, clearBrandFilter, clearSpecFilter]);

  return useMemo(
    () => ({
      filterProductId,
      filterProductName,
      filterBrandId,
      filterBrandName,
      filterSpecModel,
      fetchProductFacet,
      fetchBrandFacet,
      fetchSpecFacet,
      selectProduct,
      selectBrand,
      selectSpec,
      clearProductFilter,
      clearBrandFilter,
      clearSpecFilter,
      filterRows,
      chips,
    }),
    [
      filterProductId,
      filterProductName,
      filterBrandId,
      filterBrandName,
      filterSpecModel,
      fetchProductFacet,
      fetchBrandFacet,
      fetchSpecFacet,
      selectProduct,
      selectBrand,
      selectSpec,
      clearProductFilter,
      clearBrandFilter,
      clearSpecFilter,
      filterRows,
      chips,
    ],
  );
}
