// 测试 suggest API 在各字段上的表现
import http from 'http';

function request(method: string, path: string, body: unknown, token?: string): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: 'localhost', port: 3000, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode ?? 0, data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // 1. 登录
  const loginRes = await request('POST', '/api/auth/staff/login', { username: 'admin', password: 'Admin@123' });
  const token = (loginRes.data as { data?: { token?: string } })?.data?.token;
  if (!token) { console.error('登录失败'); process.exit(1); }

  // 2. 测试 suggest API 在各字段上的表现
  const fields = ['specModel', 'remark', 'product', 'brand', 'unit', 'category', 'supplier', 'priceType'];
  for (const field of fields) {
    const path = encodeURI(`/api/staff/products/suggest?field=${field}&keyword=DN25`);
    const res = await request('GET', path, null, token);
    console.log(`\nfield=${field} keyword=DN25 status=${res.status}`);
    const data = res.data as { data?: { options?: Array<{ value: string; type: string }> } };
    const options = data?.data?.options ?? [];
    console.log(`  options: ${options.length} 条`);
    for (const opt of options.slice(0, 3)) {
      console.log(`    - value="${opt.value}" type="${opt.type}"`);
    }
    if (res.status !== 200) {
      console.log(`  完整响应：`, JSON.stringify(res.data, null, 2));
    }
  }

  // 3. 测试 suggest API 不传 keyword
  const pathNoKw = `/api/staff/products/suggest?field=specModel`;
  const resNoKw = await request('GET', pathNoKw, null, token);
  console.log(`\nfield=specModel 无keyword status=${resNoKw.status}`);
  const dataNoKw = resNoKw.data as { data?: { options?: Array<{ value: string; type: string }> } };
  const optionsNoKw = dataNoKw?.data?.options ?? [];
  console.log(`  options: ${optionsNoKw.length} 条`);
  for (const opt of optionsNoKw.slice(0, 5)) {
    console.log(`    - value="${opt.value}" type="${opt.type}"`);
  }

  console.log('\n===== 测试完成 =====');
}

main().catch((e) => { console.error('测试失败：', e); process.exit(1); });
