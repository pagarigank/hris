const http = require('http');

const BASE = 'http://localhost:3002';
let accessToken = '';
let refreshToken = '';
let passed = 0;
let failed = 0;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} - ${detail || ''}`); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('\n=== HEALTH CHECK ===');
  let r = await request('GET', '/health');
  assert('GET /health returns 200', r.status === 200, `got ${r.status}`);
  assert('Health data has status=healthy', r.body?.data?.status === 'healthy');

  console.log('\n=== AUTH: Login ===');
  r = await request('POST', '/api/v1/auth/login', { email: 'admin@system.com', password: 'Admin123!', tenantCode: 'SYSTEM' });
  assert('Login returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  accessToken = r.body?.data?.accessToken;
  refreshToken = r.body?.data?.refreshToken;
  assert('Returns accessToken', !!accessToken);
  assert('Returns refreshToken', !!refreshToken);
  assert('Returns user object', !!r.body?.data?.user?.id);
  await sleep(1500);

  console.log('\n=== AUTH: Login validation ===');
  r = await request('POST', '/api/v1/auth/login', { email: 'bad', password: 'bad' });
  assert('Missing fields returns 400', r.status === 400, `got ${r.status}`);
  await sleep(1500);
  r = await request('POST', '/api/v1/auth/login', { email: 'x@x.com', password: 'x', tenantCode: 'SYSTEM' });
  assert('Wrong credentials returns 401', r.status === 401, `got ${r.status}`);
  await sleep(1500);

  console.log('\n=== AUTH: Refresh Token ===');
  r = await request('POST', '/api/v1/auth/refresh', { refreshToken });
  assert('Refresh returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  const newAccessToken = r.body?.data?.accessToken;
  const newRefreshToken = r.body?.data?.refreshToken;
  assert('Returns new accessToken', !!newAccessToken);
  assert('Returns new refreshToken', !!newRefreshToken);
  // Use new tokens
  accessToken = newAccessToken;
  refreshToken = newRefreshToken;
  await sleep(1500);

  console.log('\n=== AUTH: Logout ===');
  r = await request('POST', '/api/v1/auth/logout', { refreshToken });
  assert('Logout returns 200', r.status === 200, `got ${r.status}`);
  await sleep(1500);
  // Re-login for remaining tests
  r = await request('POST', '/api/v1/auth/login', { email: 'admin@system.com', password: 'Admin123!', tenantCode: 'SYSTEM' });
  accessToken = r.body?.data?.accessToken;
  refreshToken = r.body?.data?.refreshToken;
  await sleep(1500);

  console.log('\n=== UNAUTHORIZED ACCESS ===');
  r = await request('GET', '/api/v1/employees', null);
  assert('No token returns 401', r.status === 401, `got ${r.status}`);
  r = await request('GET', '/api/v1/employees', null, 'bad-token');
  assert('Bad token returns 401', r.status === 401, `got ${r.status}`);

  console.log('\n=== EMPLOYEES ===');
  r = await request('GET', '/api/v1/employees', null, accessToken);
  assert('GET /employees returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  const employees = r.body?.data?.employees || r.body?.data || [];
  assert('Returns employee list', Array.isArray(employees), `type: ${typeof employees}`);

  console.log('\n=== ATTENDANCE ===');
  r = await request('POST', '/api/v1/attendance/clock-in', { latitude: 14.5995, longitude: 120.9842 }, accessToken);
  assert('Clock-in returns 200/201', r.status === 200 || r.status === 201, `got ${r.status}: ${JSON.stringify(r.body)}`);
  await sleep(500);
  r = await request('GET', '/api/v1/attendance/logs', null, accessToken);
  assert('GET /attendance/logs returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  r = await request('GET', '/api/v1/attendance/dtr?days=7', null, accessToken);
  assert('GET /attendance/dtr returns 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== LEAVE ===');
  r = await request('GET', '/api/v1/leave/types', null, accessToken);
  assert('GET /leave/types returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  const leaveTypes = r.body?.data?.leaveTypes || r.body?.data || [];
  assert('Returns leave types', Array.isArray(leaveTypes), `type: ${typeof leaveTypes}`);
  r = await request('GET', '/api/v1/leave/credits', null, accessToken);
  assert('GET /leave/credits returns 200', r.status === 200, `got ${r.status}`);
  r = await request('GET', '/api/v1/leave/requests', null, accessToken);
  assert('GET /leave/requests returns 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== PAYROLL ===');
  r = await request('GET', '/api/v1/payroll/periods', null, accessToken);
  assert('GET /payroll/periods returns 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== HR MATRIX ===');
  r = await request('GET', '/api/v1/hr-matrix/dashboard', null, accessToken);
  assert('GET /hr-matrix/dashboard returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  r = await request('GET', '/api/v1/hr-matrix/org-chart', null, accessToken);
  assert('GET /hr-matrix/org-chart returns 200', r.status === 200, `got ${r.status}`);
  r = await request('GET', '/api/v1/hr-matrix/headcount', null, accessToken);
  assert('GET /hr-matrix/headcount returns 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== MOBILE ===');
  r = await request('POST', '/api/v1/mobile/device', { deviceToken: 'test-push-token', platform: 'android' }, accessToken);
  assert('POST /mobile/device returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);

  console.log('\n=== 404 HANDLING ===');
  r = await request('GET', '/api/v1/nonexistent', null, accessToken);
  assert('Unknown route returns 404', r.status === 404, `got ${r.status}`);

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
