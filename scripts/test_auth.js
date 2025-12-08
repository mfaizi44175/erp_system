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
        try {
          bodyOut = JSON.parse(bodyOut);
        } catch {}
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

async function authCheck(cookie) {
  const res = await request('GET', '/api/auth/check', null, { 'Cookie': cookie });
  return res;
}

async function main() {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'AdminTest!2025';
    console.log('Logging in as', username);
    const { cookie } = await login(username, password);
    console.log('Login OK');
    const res = await authCheck(cookie);
    console.log('Auth check status:', res.status);
    console.log('Auth check body:', typeof res.body === 'string' ? res.body : JSON.stringify(res.body));
  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}