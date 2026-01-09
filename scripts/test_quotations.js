// Node script to exercise ERP API endpoints for quotations
// Reuses built-in http to capture cookies and perform JSON and binary requests

const http = require('http');
const fs = require('fs');
const path = require('path');

function request(method, reqPath, data = null, cookie = null, csrfToken = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (cookie) headers['Cookie'] = cookie;
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())) {
      headers['x-csrf-token'] = csrfToken;
    }

    const options = { hostname: 'localhost', port: 4002, path: reqPath, method, headers };
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
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(username, password) {
  const res = await request('POST', '/api/login', { username, password });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${res.bodyText}`);
  const cookie = res.setCookie.map(c => c.split(';')[0]).join('; ');
  return { cookie, user: res.bodyJson?.user, csrfToken: res.bodyJson?.csrfToken || null };
}

async function createQuotation(cookie, csrfToken, queryId) {
  const payload = {
    tender_case_no: 'TN-CASE-0001',
    quotation_number: 'Q-2025-0001',
    date: '2025-11-21',
    to_client: 'ACME Corp',
    query_id: queryId,
    currency: 'USD',
    quotation_type: 'local',
    attachment: null,
    supplier_price: 60.0,
    profit_factor: 1.25,
    exchange_rate: 1.0,
    total_without_gst: 300.0,
    gst_amount: 21.0,
    grand_total: 321.0,
    items: [
      {
        manufacturer_number: 'M100',
        stockist_number: 'S200',
        coo: 'US',
        brand: 'BrandZ',
        description: 'Widget Model Z',
        au: 'EA',
        quantity: 3,
        unit_price: 100.0,
        total_price: 300.0,
        supplier_price: 60.0,
        profit_factor: 1.25,
        exchange_rate: 1.0,
        supplier_up: 75.0,
      }
    ],
  };

  const res = await request('POST', '/api/quotations', payload, cookie, csrfToken);
  if (res.status !== 200) throw new Error(`Create quotation failed: ${res.status} ${res.bodyText}`);
  return res.bodyJson;
}

async function getQuotation(cookie, id) {
  const res = await request('GET', `/api/quotations/${id}`, null, cookie);
  if (res.status !== 200) throw new Error(`Get quotation ${id} failed: ${res.status} ${res.bodyText}`);
  return res.bodyJson;
}

async function updateQuotation(cookie, csrfToken, id) {
  const payload = {
    tender_case_no: 'TN-CASE-0001-REV1',
    quotation_number: 'Q-2025-0001-REV1',
    date: '2025-11-22',
    to_client: 'ACME Corp',
    query_id: 12,
    currency: 'USD',
    quotation_type: 'import',
    attachment: null,
    supplier_price: 80.0,
    profit_factor: 1.30,
    exchange_rate: 1.0,
    total_without_gst: 500.0,
    gst_amount: 35.0,
    grand_total: 535.0,
    items: [
      {
        manufacturer_number: 'M101',
        stockist_number: 'S201',
        coo: 'DE',
        brand: 'BrandY',
        description: 'Widget Model Y',
        au: 'EA',
        quantity: 5,
        unit_price: 100.0,
        total_price: 500.0,
        supplier_price: 80.0,
        profit_factor: 1.30,
        exchange_rate: 1.0,
        supplier_up: 90.0,
      }
    ],
  };

  const res = await request('PUT', `/api/quotations/${id}`, payload, cookie, csrfToken);
  if (res.status !== 200) throw new Error(`Update quotation ${id} failed: ${res.status} ${res.bodyText}`);
  return res.bodyJson;
}

async function exportQuotationExcel(cookie, id) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'localhost', port: 4002, path: `/api/quotations/${id}/excel`, method: 'GET', headers: { 'Cookie': cookie } };
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
        const outDir = path.join(__dirname, '..', 'downloads');
        fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, `quotation_${id}_test.xlsx`);
        fs.writeFileSync(filePath, buf);
        resolve(filePath);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    console.log('Logging in...');
    const { cookie, user, csrfToken } = await login('admin', 'AdminTest!2025');
    console.log('Logged in as:', user?.username);

    const queryId = 12;
    console.log(`\nCreating quotation linked to query ${queryId}...`);
    const created = await createQuotation(cookie, csrfToken, queryId);
    console.log('Create response:', created);
    const qtid = created?.id;
    console.log('New quotation ID:', qtid);

    console.log('\nFetching quotation to verify items...');
    const q1 = await getQuotation(cookie, qtid);
    console.log('Items after create:', Array.isArray(q1.items) ? q1.items.length : q1.items);
    console.log('Items detail:', q1.items);

    console.log('\nUpdating quotation items/details...');
    const upd = await updateQuotation(cookie, csrfToken, qtid);
    console.log('Update response:', upd);

    console.log('\nFetching quotation after update...');
    const q2 = await getQuotation(cookie, qtid);
    console.log('Items after update:', Array.isArray(q2.items) ? q2.items.length : q2.items);
    console.log('Items detail:', q2.items);

    console.log('\nExporting quotation to Excel...');
    const excelPath = await exportQuotationExcel(cookie, qtid);
    console.log('Excel saved to:', excelPath);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}

main();
