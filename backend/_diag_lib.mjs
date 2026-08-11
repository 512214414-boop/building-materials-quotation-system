// 临时诊断：listProductImageLibrary + serialize（模拟 API 层，用后删除）
import { listProductImageLibrary } from './src/services/productService.js';
import { serialize } from './src/utils/response.js';

const list = await listProductImageLibrary();
const serialized = serialize(list);
console.log('条数:', serialized.length);
if (serialized.length > 0) {
  const first = serialized[0];
  console.log('首条字段类型: id=', typeof first.id, 'brandId=', typeof first.brandId, 'categoryId=', typeof first.categoryId);
  console.log('首条:', JSON.stringify(first).slice(0, 500));
}
