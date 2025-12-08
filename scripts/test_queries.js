// Simple Node script to exercise ERP API endpoints for queries
// Uses built-in http module to avoid external dependencies and to capture Set-Cookie headers

const http = require('http');

function request(method, path, data = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (cookie) headers['Cookie'] = cookie;

    const options = {
      hostname: 'localhost',
      port: 4002,
      path,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const setCookieHeader = res.headers['set-cookie'];
        resolve({
          status: res.statusCode,
          headers: res.headers,
          setCookie: Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader] : []),
          bodyText: bodyStr,
          bodyJson: (() => { try { return JSON.parse(bodyStr); } catch { return null; } })(),
        });
      });
    });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(username, password) {
  const res = await request('POST', '/api/login', { username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed: status ${res.status}, body: ${res.bodyText}`);
  }
  const cookie = res.setCookie.map(c => c.split(';')[0]).join('; ');
  return { cookie, user: res.bodyJson?.user };
}

function buildMultipartBody(fields) {
  const boundary = '----TraeBoundary' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return { boundary, body };
}

async function createQuery(cookie) {
  const itemsStr = JSON.stringify([
    {
      manufacturer_number: 'M001',
      stockist_number: 'S001',
      coo: 'US',
      brand: 'BrandX',
      description: 'Test item',
      au: 'EA',
      quantity: 5,
      remarks: 'Urgent',
    }
  ]);

  const fields = {
    org_department: 'Sales',
    client_case_number: 'CC-001',
    date: '2025-11-20',
    last_submission_date: '2025-11-25',
    client_name: 'ACME Corp',
    query_sent_to: 'SupplierA',
    nsets_case_number: 'NSETS-001',
    enquiry_date: '2025-11-19',
    last_submission_excel_date: '2025-11-25',
    items: itemsStr,
  };

  // Build multipart/form-data body
  const { boundary, body } = buildMultipartBody(fields);

  // Manually perform the request using http to set correct headers
  const res = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4002,
      path: '/api/queries',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Cookie': cookie,
      },
    };
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, bodyText: bodyStr, bodyJson: (() => { try { return JSON.parse(bodyStr); } catch { return null; } })() });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (res.status !== 200) {
    throw new Error(`Create query failed: status ${res.status}, body: ${res.bodyText}`);
  }
  return res.bodyJson;
}

async function getQuery(cookie, id) {
  const res = await request('GET', `/api/queries/${id}`, null, cookie);
  if (res.status !== 200) {
    throw new Error(`Get query ${id} failed: status ${res.status}, body: ${res.bodyText}`);
  }
  return res.bodyJson;
}

async function exportQueryExcel(cookie, id) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4002,
      path: `/api/queries/${id}/excel`,
      method: 'GET',
      headers: { 'Cookie': cookie },
    };
    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => reject(new Error(`Excel export failed: ${res.statusCode} ${Buffer.concat(chunks).toString('utf8')}`)));
        return;
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const fs = require('fs');
        const path = require('path');
        const outDir = path.join(__dirname, '..', 'downloads');
        fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, `query_${id}_test.xlsx`);
        fs.writeFileSync(filePath, buf);
        resolve(filePath);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function updateQuery(cookie, id) {
  const itemsStr = JSON.stringify([
    {
      manufacturer_number: 'M002',
      stockist_number: 'S002',
      coo: 'DE',
      brand: 'BrandY',
      description: 'Updated item',
      au: 'EA',
      quantity: 10,
      remarks: 'Normal',
    }
  ]);

  const fields = {
    org_department: 'Sales',
    client_case_number: 'CC-001',
    date: '2025-11-21',
    last_submission_date: '2025-11-26',
    client_name: 'ACME Corp',
    query_sent_to: 'SupplierA',
    status: 'pending',
    nsets_case_number: 'NSETS-001',
    enquiry_date: '2025-11-20',
    last_submission_excel_date: '2025-11-26',
    items: itemsStr,
  };

  const { boundary, body } = buildMultipartBody(fields);

  const res = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4002,
      path: `/api/queries/${id}`,
      method: 'PUT',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Cookie': cookie,
      },
    };
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, bodyText: bodyStr, bodyJson: (() => { try { return JSON.parse(bodyStr); } catch { return null; } })() });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (res.status !== 200) {
    throw new Error(`Update query ${id} failed: status ${res.status}, body: ${res.bodyText}`);
  }
  return res.bodyJson;
}

async function main() {
  try {
    console.log('Logging in...');
    const { cookie, user } = await login('admin', 'AdminTest!2025');
    console.log('Logged in as:', user?.username);
    console.log('Cookie:', cookie);

    console.log('\nCreating query...');
    const created = await createQuery(cookie);
    console.log('Create response:', created);
    const qid = created?.id;
    console.log('New query ID:', qid);

    console.log('\nFetching query to verify items...');
    const q1 = await getQuery(cookie, qid);
    console.log('Items after create:', Array.isArray(q1.items) ? q1.items.length : q1.items);
    console.log('Items detail:', q1.items);

    console.log('\nUpdating query items...');
    const upd = await updateQuery(cookie, qid);
    console.log('Update response:', upd);

    console.log('\nFetching query after update...');
    const q2 = await getQuery(cookie, qid);
    console.log('Items after update:', Array.isArray(q2.items) ? q2.items.length : q2.items);
    console.log('Items detail:', q2.items);

    console.log('\nExporting query to Excel...');
    const excelPath = await exportQueryExcel(cookie, qid);
    console.log('Excel saved to:', excelPath);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}

main();