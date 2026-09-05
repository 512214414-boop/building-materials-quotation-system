import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext } from '../src/crosscutting/tenant-context.js';
import { entityId, type EntityId } from '../src/domain/shared/identifier.js';
import { PrismaRepositoryBase, type RepositoryMapper } from '../src/infrastructure/persistence/prisma/prisma-repository-base.js';

// ---- 内存 fake delegate：模拟 Prisma model delegate + DB 层租户隔离 ----
function makeFakeDelegate() {
  const store: any[] = [];
  const byId = (id: bigint) => store.find((r) => r.id === id);
  return {
    async findUnique(args: any) {
      return (
        store.find(
          (r) => r.id === args.where.id && r.tenantId === args.where.tenantId,
        ) ?? null
      );
    },
    async findMany(args: any) {
      const w = args.where ?? {};
      return store.filter((r) => Object.entries(w).every(([k, v]) => r[k] === v));
    },
    async create(args: any) {
      store.push(args.data);
      return args.data;
    },
    async update(args: any) {
      const row = byId(args.where.id);
      if (row) Object.assign(row, args.data);
      return row;
    },
    async delete(args: any) {
      const i = store.findIndex(
        (r) => r.id === args.where.id && r.tenantId === args.where.tenantId,
      );
      if (i >= 0) store.splice(i, 1);
      return {};
    },
    async upsert(args: any) {
      const row = byId(args.where.id);
      if (row) {
        Object.assign(row, args.update);
        return row;
      }
      store.push({ id: args.where.id, ...args.create });
      return store[store.length - 1];
    },
    _store: store,
  };
}

// ---- 一个参考聚合：Product ----
type ProductId = EntityId<'Product'>;
interface Product {
  id: ProductId;
  name: string;
  tenantId: bigint;
}

class ProductRepository extends PrismaRepositoryBase<Product, ProductId> {
  constructor(delegate: any) {
    const mapper: RepositoryMapper<Product> = {
      toDomain(row: any): Product {
        return {
          id: entityId<'Product'>(BigInt(row.id)),
          name: row.name,
          tenantId: row.tenantId,
        };
      },
      toPersistence(e: Product) {
        return { id: e.id as bigint, data: { name: e.name } };
      },
    };
    super(delegate, mapper);
  }
}

test('save 在指定租户下写入，findById 同租户可见', async () => {
  const repo = new ProductRepository(makeFakeDelegate());
  const p: Product = { id: entityId<'Product'>(1001n), name: '水泥', tenantId: 1n };
  await TenantContext.run(1n, async () => {
    await repo.save(p);
    const found = await repo.findById(entityId<'Product'>(1001n));
    assert.equal(found !== null && found.name, '水泥');
  });
});

test('租户隔离：B 租户不可见 A 租户写入的数据', async () => {
  const repo = new ProductRepository(makeFakeDelegate());
  await TenantContext.run(1n, () =>
    repo.save({ id: entityId<'Product'>(2002n), name: '钢筋', tenantId: 1n }),
  );
  const seenByB = await TenantContext.run(2n, () =>
    repo.findById(entityId<'Product'>(2002n)),
  );
  assert.equal(seenByB, null);
});

test('findMany 仅返回当前租户行', async () => {
  const repo = new ProductRepository(makeFakeDelegate());
  await TenantContext.run(1n, async () => {
    await repo.save({ id: entityId<'Product'>(1n), name: 'a', tenantId: 1n });
    await repo.save({ id: entityId<'Product'>(2n), name: 'b', tenantId: 1n });
  });
  await TenantContext.run(2n, () =>
    repo.save({ id: entityId<'Product'>(3n), name: 'c', tenantId: 2n }),
  );

  const aRows = await TenantContext.run(1n, () => repo.findMany());
  const bRows = await TenantContext.run(2n, () => repo.findMany());
  assert.equal(aRows.length, 2);
  assert.equal(bRows.length, 1);
  assert.deepEqual(bRows.map((r) => r.name), ['c']);
});

test('remove 仅删除当前租户行', async () => {
  const delegate = makeFakeDelegate();
  const repo = new ProductRepository(delegate);
  await TenantContext.run(1n, () =>
    repo.save({ id: entityId<'Product'>(9n), name: 'x', tenantId: 1n }),
  );
  await TenantContext.run(1n, () => repo.remove(entityId<'Product'>(9n)));
  assert.equal(delegate._store.length, 0);
});
