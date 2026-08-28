// 选品里改档案的影响说明。开单行走确认层确认才写；这里改的是产品库，要先看范围再写。
// 默认改当前；字典类（单位/品牌/分类/售价类型/供应商）另给「改全局」。

import type { DictChangeKind } from '../../services/api/baseDataApi.js';

export type PickerCatalogKind =
  | 'product'
  | 'spec'
  | 'category'
  | 'brand'
  | 'unit'
  | 'priceType'
  | 'supplier'
  | 'saleFace'
  | 'salePoint'
  | 'purchaseFace'
  | 'purchasePoint'
  | 'conversion'
  | 'addSpec'
  | 'addBrand'
  | 'addUnit'
  | 'addSaleType'
  | 'addChannel'
  /** 档案矩阵格：impact / dictConfig 由调用方注入，无改全局 */
  | 'archiveField';

export interface CatalogImpactView {
  title: string;
  /** 额外说明（不是原/新对比）。对比走 ValueChangePair，不要往这里拼「」箭头句 */
  change?: string;
  /** 圈组/范围，单独弱字一行，不混进对比卡片 */
  scopeLine?: string;
  bullets: string[];
  /** 有改全局按钮时，黄字说明全局会波及哪里 */
  globalBullets?: string[];
}

const SNAP = '已开单据行保持当时抄下来的内容，再插入才换成新内容。';

export function catalogHasGlobal(kind: PickerCatalogKind): boolean {
  return (
    kind === 'unit' ||
    kind === 'brand' ||
    kind === 'category' ||
    kind === 'priceType' ||
    kind === 'supplier' ||
    kind === 'salePoint' ||
    kind === 'purchasePoint'
  );
}

/** 有字典表的格子：确认层用检索下拉，不靠纯手输。 */
export function catalogDictField(kind: PickerCatalogKind): DictChangeKind | undefined {
  if (kind === 'brand' || kind === 'addBrand') return 'brand';
  if (kind === 'unit' || kind === 'addUnit') return 'unit';
  if (kind === 'category') return 'category';
  if (kind === 'priceType' || kind === 'addSaleType') return 'priceType';
  if (kind === 'supplier' || kind === 'addChannel') return 'supplier';
  return undefined;
}

export function describeCatalogImpact(
  kind: PickerCatalogKind,
  _from: string,
  _to: string,
  scope?: string,
): CatalogImpactView {
  const where = scope?.trim() ? scope.trim() : '';
  const scopeLine = where || undefined;

  switch (kind) {
    case 'product':
      return {
        title: '修改产品名称',
        scopeLine,
        bullets: ['只改这一个产品的名称，不改别的产品。', SNAP],
      };
    case 'spec':
      return {
        title: '修改系列/规格',
        scopeLine,
        bullets: ['只改这一条系列/规格。', SNAP],
      };
    case 'category':
      return {
        title: '修改分类',
        scopeLine,
        bullets: ['这个产品换到新分类；没有这个分类会先建出来。', SNAP],
        globalBullets: ['把原来那个分类在全系统改名；字典里已有这个名字，就把所有挂在旧分类下的产品并过去。', SNAP],
      };
    case 'brand':
      return {
        title: '修改品牌',
        scopeLine,
        bullets: ['这条规格换到新品牌；有就复用，没有会新建品牌。', SNAP],
        globalBullets: ['把原来那个品牌在全系统改名；字典里已有这个名字，就把所有用旧品牌的规格并到已有档案。', SNAP],
      };
    case 'unit':
      return {
        title: '修改单位',
        scopeLine,
        bullets: ['只改这条规格用的单位：有就换过去，没有会进字典再挂上。别的产品不受影响。', SNAP],
        globalBullets: ['把这条全局单位改名；字典里已有同名单位，就把所有引用并过去，不是报已存在。', SNAP],
      };
    case 'priceType':
      return {
        title: '修改售价类型',
        scopeLine,
        bullets: ['只改这一条售价用的类型；有就换过去，没有会先建出来。', SNAP],
        globalBullets: ['把这个售价类型在全系统改名；字典里已有同名类型，就把所有用它的售价并过去。', SNAP],
      };
    case 'supplier':
      return {
        title: '修改供应渠道',
        scopeLine,
        bullets: ['只改这一条进价用的渠道；有就换过去，没有会先建出来。', SNAP],
        globalBullets: ['把这个供应商在全系统改名；字典里已有同名，就把所有用它的进价并过去。应付单仍挂当时的供应商。', SNAP],
      };
    case 'saleFace':
      return {
        title: '修改售价面价',
        scopeLine,
        bullets: [
          '只改当前这一条的售价面价。库里存面价和点位，开单用的是面价×点位后的实际售价。',
          SNAP,
        ],
      };
    case 'salePoint':
      return {
        title: '修改售价点位',
        scopeLine,
        bullets: [
          '确认修改：只改当前这一条规格的售价点位，面价不动。',
          '库里存的是面价和点位，开单用的是乘完之后的实际售价。',
          SNAP,
        ],
        globalBullets: [
          where
            ? `改全局：把「${where}」这一批的售价点位一起改。同一品牌里水管、阀门、电线点位本来就不一样，其他分类不会被改到。`
            : '改全局：同一品牌、同一分类、同一种售价类型这一批一起改，不是整个品牌。',
          '已经单独改过点位的规格不跟着变。',
        ],
      };
    case 'purchaseFace':
      return {
        title: '修改进价面价',
        scopeLine,
        bullets: [
          '只改当前这一条的进价面价。库里存面价和点位，用的是面价×点位后的实际进价。',
          SNAP,
        ],
      };
    case 'purchasePoint':
      return {
        title: '修改进价点位',
        scopeLine,
        bullets: [
          '确认修改：只改当前这一条规格的进价点位，面价不动。',
          '库里存的是面价和点位，用的是乘完之后的实际进价。',
          SNAP,
        ],
        globalBullets: [
          where
            ? `改全局：把「${where}」这一批的进价点位一起改。同一品牌里水管、阀门、电线点位本来就不一样，其他分类不会被改到。`
            : '改全局：同一进货渠道、同一品牌、同一分类这一批一起改，不是整个品牌。',
          '已经单独改过点位的规格不跟着变。',
        ],
      };
    case 'conversion':
      return {
        title: '修改换算率',
        scopeLine,
        bullets: [
          '只改这一条规格、这个品牌、这个单位：1 该单位等于多少基准。基准单位固定为 1。未录面价时按基准×率推算，不写库。',
          SNAP,
        ],
      };
    case 'addSpec':
      return {
        title: '新增规格',
        scopeLine,
        bullets: ['在本产品、本品牌下新增这条规格。已有规格不动。', SNAP],
      };
    case 'addBrand':
      return {
        title: '新增品牌',
        scopeLine,
        bullets: ['给本产品挂上这个品牌；没有会新建品牌。已有品牌不动。', SNAP],
      };
    case 'addUnit':
      return {
        title: '新增单位',
        scopeLine,
        bullets: ['给这条规格加上这个单位；没有会进全局单位字典。', SNAP],
      };
    case 'addSaleType':
      return {
        title: '新增售价类型',
        scopeLine,
        bullets: ['给这个单位加上这种售价；没有这个类型会先建出来。', SNAP],
      };
    case 'addChannel':
      return {
        title: '新增供应渠道',
        scopeLine,
        bullets: ['给这个单位加上这条进价渠道；没有这个供应商会先建出来。', SNAP],
      };
    case 'archiveField':
      return {
        title: '修改',
        scopeLine,
        bullets: ['仅修改当前格子。', '取消则不保存。'],
      };
  }
}
