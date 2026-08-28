// v2.2 API 服务层统一出口
// 统一聚合 13 个 API 模块：鉴权、单据、报价、收款、配货（V4+V5合并）、交付、成本、退款、汇总、定档、客户端、基础数据、系统管理

export * from './authApi.js';
export * from './documentApi.js';
export * from './purchaseQuoteApi.js';
export * from './paymentApi.js';
export * from './allocationApi.js';
export * from './deliveryApi.js';
export * from './costApi.js';
export * from './refundApi.js';
export * from './summaryApi.js';
export * from './archiveApi.js';
export * from './customerApi.js';
export * from './baseDataApi.js';
export * from './systemApi.js';
export * from './inventoryApi.js';
export * from './purchaseInboundApi.js';
export * from './opsReportApi.js';
export * from './payableApi.js';
