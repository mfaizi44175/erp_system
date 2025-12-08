const http = require('http');

function request(method, pathUrl, body = null, headers = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: options.host || 'localhost',
      port: options.port || (process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 4002),
      path: pathUrl,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let bodyOut = buf.toString('utf8');
        try { bodyOut = JSON.parse(bodyOut); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: bodyOut });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(username, password) {
  const payload = JSON.stringify({ username, password });
  const res = await request('POST', '/api/login', payload, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  });
  if (res.status !== 200) throw new Error('Login failed: ' + JSON.stringify(res.body));
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
  return { cookie, user: res.body.user };
}

async function listUsers(cookie) {
  return request('GET', '/api/users', null, { 'Cookie': cookie });
}

async function getUser(cookie, id) {
  return request('GET', `/api/users/${id}`, null, { 'Cookie': cookie });
}

async function updateUser(cookie, id, payload) {
  const body = JSON.stringify(payload);
  return request('PUT', `/api/users/${id}`, body, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cookie': cookie
  });
}

async function updateUserPassword(cookie, id, newPassword) {
  const body = JSON.stringify({ password: newPassword });
  return request('PUT', `/api/users/${id}/password`, body, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cookie': cookie
  });
}

async function authCheck(cookie) {
  return request('GET', '/api/auth/check', null, { 'Cookie': cookie });
}

async function main() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminTest!2025';
    const { cookie: adminCookie } = await login(adminUsername, adminPassword);
    console.log('Admin login OK');

    // List users
    const listRes = await listUsers(adminCookie);
    console.log('List users status:', listRes.status);
    if (listRes.status !== 200) throw new Error('List users failed: ' + JSON.stringify(listRes.body));
    const users = listRes.body.users || listRes.body || [];
    console.log('Users count:', users.length);
    users.forEach(u => {
      console.log(`- id=${u.id} username=${u.username} role=${u.role} active=${u.is_active}`);
    });

    // Find shahzad user if exists
    const shahzad = users.find(u => (u.username || '').toLowerCase() === 'shahzad');
    if (!shahzad) {
      console.log('User shahzad not found, skipping user-specific tests.');
      return;
    }

    // Get single user
    const getRes = await getUser(adminCookie, shahzad.id);
    console.log('Get user status:', getRes.status);
    if (getRes.status !== 200) throw new Error('Get user failed: ' + JSON.stringify(getRes.body));
    console.log('User details:', getRes.body.username, getRes.body.status);

    // Activate user and update details minimal
    const updRes = await updateUser(adminCookie, shahzad.id, {
      email: getRes.body.email || '',
      full_name: getRes.body.full_name || 'Shahzad',
      role: getRes.body.role || 'admin',
      permissions: getRes.body.permissions || { queries: true, quotations: true, purchase_orders: true, invoices: true, attachments: true, admin: true },
      is_active: 1
    });
    console.log('Update user status:', updRes.status);
    if (updRes.status !== 200) throw new Error('Update user failed: ' + JSON.stringify(updRes.body));

    // Update password
    const newPassword = process.env.TEST_USER_PASSWORD || 'ShahzadTemp!2025';
    const pwdRes = await updateUserPassword(adminCookie, shahzad.id, newPassword);
    console.log('Update user password status:', pwdRes.status);
    if (pwdRes.status !== 200) throw new Error('Update user password failed: ' + JSON.stringify(pwdRes.body));

    // Login as shahzad
    const { cookie: userCookie } = await login('shahzad', newPassword);
    console.log('Shahzad login OK');

    // Auth check
    const checkRes = await authCheck(userCookie);
    console.log('Auth check status:', checkRes.status);
    console.log('Authenticated:', checkRes.body.authenticated, 'User:', checkRes.body.user && checkRes.body.user.username);

  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}