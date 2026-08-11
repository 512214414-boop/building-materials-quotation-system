// HTTP API 端到端测试：模拟前端真实调用 saveProduct / deleteProduct
// 目的：验证后端 HTTP 层是否有问题
import http from 'http';

const BASE = 'localhost:3000';

function request(
  method: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { host: 'localhost', port: 3000, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // 1. 登录
  console.log('===== 1. 登录 =====');
  const loginRes = await request('POST', '/api/auth/staff/login', {
    username: 'admin',
    password: 'Admin@123',
  });
  console.log(`登录状态：${loginRes.status}`);
  const token = (loginRes.data as { data?: { token?: string } })?.data?.token;
  if (!token) {
    console.error('登录失败，无法继续测试');
    console.error('响应：', loginRes.data);
    process.exit(1);
  }
  console.log(`token: ${token.slice(0, 20)}...`);

  // 2. 新建产品（1个品牌）
  console.log('\n===== 2. 新建产品（1个品牌）=====');
  const createRes = await request(
    'POST',
    '/api/staff/products/save',
    {
      name: 'HTTP测试管材',
      specModel: 'DN25',
      categoryId: 0,
      remark: 'HTTP测试',
      units: [{ unitName: '根', isBase: true, isDisplay: true }],
      brands: [{ name: '伟星', conversions: [] }],
    },
    token,
  );
  console.log(`新建状态：${createRes.status}`);
  console.log(`新建响应：`, JSON.stringify(createRes.data, null, 2));
  if (createRes.status !== 201) {
    console.error('新建失败');
    process.exit(1);
  }
  const productId = (createRes.data as { data?: { id?: string } })?.data?.id;
  console.log(`productId: ${productId}`);

  // 3. 查询列表（验证是否只显示1行）
  console.log('\n===== 3. 搜索产品列表 =====');
  const searchRes = await request(
    'GET',
    encodeURI('/api/staff/products/search?keyword=HTTP测试&page=1&size=20'),
    null,
    token,
  );
  console.log(`搜索状态：${searchRes.status}`);
  const searchData = searchRes.data as {
    data?: { list?: Array<{ type: string; productId?: string; brandName?: string }> };
  };
  const skuList = searchData?.data?.list ?? [];
  console.log(`搜索结果：${skuList.length} 条`);
  for (const item of skuList) {
    console.log(
      `  type=${item.type} productId=${item.productId} brandName=${item.brandName ?? ''}`,
    );
  }

  // 4. 编辑产品，不传 brand.id（模拟前端丢失 brandId）
  console.log('\n===== 4. 编辑产品（不传 brand.id）=====');
  const editRes = await request(
    'POST',
    '/api/staff/products/save',
    {
      id: productId,
      name: 'HTTP测试管材',
      specModel: 'DN25',
      categoryId: 0,
      remark: 'HTTP测试-编辑',
      units: [{ unitName: '根', isBase: true, isDisplay: true }],
      brands: [{ name: '伟星', conversions: [] }], // 不传 id
    },
    token,
  );
  console.log(`编辑状态：${editRes.status}`);
  console.log(`编辑响应：`, JSON.stringify(editRes.data, null, 2));

  // 5. 再次搜索（验证宽表没有重复）
  console.log('\n===== 5. 编辑后搜索（验证无重复）=====');
  const searchRes2 = await request(
    'GET',
    encodeURI('/api/staff/products/search?keyword=HTTP测试&page=1&size=20'),
    null,
    token,
  );
  const searchData2 = searchRes2.data as {
    data?: { list?: Array<{ type: string; productId?: string; brandName?: string }> };
  };
  const skuList2 = searchData2?.data?.list ?? [];
  console.log(`搜索结果：${skuList2.length} 条`);
  for (const item of skuList2) {
    console.log(
      `  type=${item.type} productId=${item.productId} brandName=${item.brandName ?? ''}`,
    );
  }

  // 6. 删除产品
  console.log('\n===== 6. 删除产品 =====');
  const delRes = await request(
    'DELETE',
    `/api/staff/products/${productId}`,
    null,
    token,
  );
  console.log(`删除状态：${delRes.status}`);
  console.log(`删除响应：`, JSON.stringify(delRes.data, null, 2));

  // 7. 重新录入（验证"无法保存"问题）
  console.log('\n===== 7. 重新录入（验证"无法保存"问题）=====');
  const recreateRes = await request(
    'POST',
    '/api/staff/products/save',
    {
      name: 'HTTP测试管材',
      specModel: 'DN25',
      categoryId: 0,
      remark: 'HTTP测试-重新录入',
      units: [{ unitName: '根', isBase: true, isDisplay: true }],
      brands: [{ name: '伟星', conversions: [] }],
    },
    token,
  );
  console.log(`重新录入状态：${recreateRes.status}`);
  console.log(`重新录入响应：`, JSON.stringify(recreateRes.data, null, 2));

  // 8. 清理
  const newProductId = (recreateRes.data as { data?: { id?: string } })?.data?.id;
  if (newProductId) {
    await request('DELETE', `/api/staff/products/${newProductId}`, null, token);
    console.log('清理完成');
  }

  console.log('\n===== 测试完成 =====');
}

main().catch((e) => {
  console.error('测试失败：', e);
  process.exit(1);
});
