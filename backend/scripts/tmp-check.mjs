const BASE = 'http://localhost:3000';
const lr = await fetch(`${BASE}/api/auth/staff/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
});
const { data } = await lr.json();
const H = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' };
for (const url of ['/api/staff/r/supplier?page=1&pageSize=5', '/api/staff/r/supplier']) {
  const r = await fetch(BASE + url, { headers: H });
  const j = await r.json();
  console.log(url, '→', r.status, JSON.stringify(j).slice(0, 400));
}
