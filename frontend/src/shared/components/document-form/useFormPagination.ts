/**
 * 单据分页 Hook
 * 按模板行容量切片，补空白行，计算小计
 */

import { useMemo } from 'react';
import type { DocumentFormLine, DocumentFormPage, TemplateConfig } from './types';

interface UseFormPaginationParams {
  lines: DocumentFormLine[];
  config: TemplateConfig;
}

interface UseFormPaginationResult {
  pages: DocumentFormPage[];
  totalPages: number;
  totalAmount: number;
}

/**
 * 单据分页 Hook
 * @param lines 原始数据行
 * @param config 模板配置
 * @returns 分页后的页数据、总页数、总金额
 */
export function useFormPagination(params: UseFormPaginationParams): UseFormPaginationResult {
  const { lines, config } = params;
  
  return useMemo(() => {
    // 计算总金额
    const totalAmount = lines.reduce((sum, line) => {
      return sum + (line.isEmpty ? 0 : (line.amount || 0));
    }, 0);
    
    // 计算总页数
    const totalPages = Math.max(1, Math.ceil(lines.length / config.rowCapacity));
    
    // 按模板行容量切片
    const pages: DocumentFormPage[] = [];
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const startIndex = pageIndex * config.rowCapacity;
      const endIndex = Math.min(startIndex + config.rowCapacity, lines.length);
      
      // 当前页的数据行
      const pageLines: DocumentFormLine[] = [];
      
      // 填充数据行
      for (let i = startIndex; i < endIndex; i++) {
        const line = lines[i];
        pageLines.push({
          ...line,
          seq: i + 1, // 全局序号从1开始
        });
      }
      
      // 补空白行到满页
      const emptyCount = config.rowCapacity - pageLines.length;
      for (let i = 0; i < emptyCount; i++) {
        pageLines.push({
          id: `empty-${pageIndex}-${i}`,
          seq: startIndex + pageLines.length + i + 1,
          isEmpty: true,
        });
      }
      
      // 计算本页小计
      const subtotal = pageLines.reduce((sum, line) => {
        return sum + (line.isEmpty ? 0 : (line.amount || 0));
      }, 0);
      
      pages.push({
        pageIndex,
        totalPages,
        lines: pageLines,
        subtotal,
        isLastPage: pageIndex === totalPages - 1,
      });
    }
    
    return {
      pages,
      totalPages,
      totalAmount,
    };
  }, [lines, config]);
}

/**
 * 追加新空白行
 * 用于空白行填满后自动追加
 */
export function appendEmptyLine(lines: DocumentFormLine[]): DocumentFormLine[] {
  return [
    ...lines,
    {
      id: `new-${Date.now()}`,
      seq: lines.length + 1,
      isEmpty: true,
    },
  ];
}