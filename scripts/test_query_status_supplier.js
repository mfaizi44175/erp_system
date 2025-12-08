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

function buildMultipart({ fields = {}, files = [] }) {
  const boundary = '----TraeBoundary' + Math.random().toString(16).slice(2);
  const parts = [];

  // Fields
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    parts.push(Buffer.from(String(value)));
    parts.push(Buffer.from(`\r\n`));
  }

  // Files
  files.forEach(file => {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`));
    parts.push(Buffer.from(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`));
    parts.push(Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer));
    parts.push(Buffer.from(`\r\n`));
  });

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType, contentLength: body.length };
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

async function listQueries(cookie) {
  return request('GET', '/api/queries', null, { 'Cookie': cookie });
}

async function getQuery(cookie, id) {
  return request('GET', `/api/queries/${id}`, null, { 'Cookie': cookie });
}

async function createQuery(cookie) {
  // Minimal query payload using multipart
  const items = [{ manufacturer_number: 'M-001', stockist_number: 'S-001', coo: 'CN', brand: 'TestBrand', description: 'Test item', au: 'PCS', quantity: 10, remarks: '' }];
  const fields = {
    org_department: 'QA',
    client_case_number: 'CCN-TEST-001',
    date: new Date().toISOString().slice(0, 10),
    last_submission_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    client_name: 'Test Client',
    query_sent_to: 'Supplier A',
    nsets_case_number: 'NSETS-TEST-001',
    enquiry_date: new Date().toISOString().slice(0, 10),
    last_submission_excel_date: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
    items: JSON.stringify(items)
  };
  const mp = buildMultipart({ fields, files: [{ name: 'attachment', filename: 'query_note.txt', contentType: 'text/plain', buffer: Buffer.from('Test query attachment') }] });
  const res = await request('POST', '/api/queries', mp.body, {
    'Content-Type': mp.contentType,
    'Content-Length': mp.contentLength,
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Create query failed: ' + JSON.stringify(res.body));
  return res.body.id;
}

async function updateQueryStatusWithSuppliers(cookie, id, responses, files) {
  const fields = {
    status: 'responded',
    supplier_responses: JSON.stringify(responses)
  };
  const mp = buildMultipart({ fields, files });
  return request('PUT', `/api/queries/${id}/status`, mp.body, {
    'Content-Type': mp.contentType,
    'Content-Length': mp.contentLength,
    'Cookie': cookie
  });
}

async function main() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminTest!2025';
    const { cookie } = await login(adminUsername, adminPassword);
    console.log('Admin login OK');

    // Determine query id
    let queryId = 12;
    let q12 = await getQuery(cookie, queryId);
    if (q12.status !== 200) {
      const list = await listQueries(cookie);
      if (list.status === 200 && Array.isArray(list.body) && list.body.length > 0) {
        queryId = list.body[0].id;
      } else {
        queryId = await createQuery(cookie);
      }
    }
    console.log('Using query id:', queryId);

    // Prepare supplier responses and attachments
    const responses = [
      { supplier: 'Supplier A', response: 'quoted' },
      { supplier: 'Supplier B', response: 'no_stock' }
    ];
    const files = [
      { name: 'supplier_attachment_0', filename: 'supplierA.pdf', contentType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%Mock PDF content for testing supplier attachment') }
    ];

    const upd = await updateQueryStatusWithSuppliers(cookie, queryId, responses, files);
    console.log('Status update result:', upd.status, upd.body && upd.body.message);
    if (upd.status !== 200) {
      console.error('Status update error:', upd.body);
      process.exitCode = 1;
      return;
    }

    // Verify by fetching query
    const verify = await getQuery(cookie, queryId);
    console.log('Verify query fetch status:', verify.status);
    if (verify.status !== 200) {
      console.error('Failed to fetch query for verification');
      process.exitCode = 1;
      return;
    }
    const supplierResponses = verify.body.supplier_responses || [];
    console.log('Supplier responses count:', supplierResponses.length);
    supplierResponses.slice(0, 5).forEach((sr, idx) => {
      console.log(`#${idx + 1}`, sr.supplier_name, sr.response_status, sr.attachment_path ? 'attached' : 'no attachment');
    });
    console.log('Query status:', verify.body.status);

  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}