// Node.js script to test ERP API endpoints for Purchase Orders
// Includes: login, create PO, get PO, update PO, export PO to Excel

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 4002;

function request(method, pathUrl, body = null, headers = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: options.host || 'localhost',
      port: options.port || DEFAULT_PORT,
      path: pathUrl,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            const json = JSON.parse(buffer.toString('utf8'));
            resolve({ status: res.statusCode, headers: res.headers, body: json });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: buffer.toString('utf8') });
          }
        } else {
          resolve({ status: res.statusCode, headers: res.headers, body: buffer });
        }
      });
    });
    req.on('error', (err) => reject(err));
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
  return { cookie, user: res.body.user, csrfToken: res.body.csrfToken || null };
}

async function createPurchaseOrder(cookie, csrfToken, po) {
  const payload = JSON.stringify(po);
  const res = await request('POST', '/api/purchase-orders', payload, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Create PO failed: ' + JSON.stringify(res.body));
  return res.body.id;
}

async function getPurchaseOrder(cookie, id) {
  const res = await request('GET', `/api/purchase-orders/${id}`, null, {
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Get PO failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function updatePurchaseOrder(cookie, csrfToken, id, po) {
  const payload = JSON.stringify(po);
  const res = await request('PUT', `/api/purchase-orders/${id}`, payload, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Update PO failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function exportPurchaseOrderExcel(cookie, id, filenameHint = `purchase_order_${id}_test.xlsx`) {
  const res = await request('GET', `/api/purchase-orders/${id}/excel`, null, {
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Export PO Excel failed: ' + res.status + ' ' + (res.headers['content-type'] || ''));
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  const filePath = path.join(downloadsDir, filenameHint);
  fs.writeFileSync(filePath, res.body);
  return filePath;
}

async function main() {
  try {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminTest!2025';
    console.log('Logging in as admin...', adminUser);
    const { cookie, csrfToken } = await login(adminUser, adminPass);
    console.log('Login OK');

    // Create a PO linked logically to quotation id 3 (no explicit DB link, so we reference in PO number)
    const poCreate = {
      po_number: 'PO-Q3-001',
      date: new Date().toISOString().slice(0, 10),
      supplier_name: 'Acme Supplies Co.',
      supplier_address: '42 Market Street, Springfield',
      po_currency: 'USD',
      total_price: 5000,
      freight_charges: 250,
      grand_total: 5250,
      items: [
        {
          serial_number: 1,
          manufacturer_number: 'MN-PO-001',
          stockist_number: 'SN-PO-001',
          coo: 'US',
          brand: 'Acme',
          description: 'Industrial Valve',
          au: 'EA',
          quantity: 10,
          unit_price: 500,
          total_price: 5000,
          delivery_time: '4 weeks',
          remarks: 'Priority delivery'
        }
      ]
    };

    console.log('Creating Purchase Order...');
    const poId = await createPurchaseOrder(cookie, csrfToken, poCreate);
    console.log('Created PO ID:', poId);

    console.log('Fetching created PO...');
    const createdPO = await getPurchaseOrder(cookie, poId);
    console.log('Items count after create:', Array.isArray(createdPO.items) ? createdPO.items.length : 0);
    if (!createdPO.items || createdPO.items.length !== 1) {
      throw new Error('Unexpected items count after create');
    }

    // Update PO and items
    const poUpdate = {
      po_number: 'PO-Q3-001-UPDATED',
      date: new Date().toISOString().slice(0, 10),
      supplier_name: 'Acme Supplies Co.',
      supplier_address: '42 Market Street, Springfield',
      po_currency: 'USD',
      total_price: 6500,
      freight_charges: 300,
      grand_total: 6800,
      items: [
        {
          serial_number: 1,
          manufacturer_number: 'MN-PO-002',
          stockist_number: 'SN-PO-002',
          coo: 'US',
          brand: 'Acme',
          description: 'Industrial Valve - Updated',
          au: 'EA',
          quantity: 12,
          unit_price: 500,
          total_price: 6000,
          delivery_time: '3 weeks',
          remarks: 'Expedite'
        },
        {
          serial_number: 2,
          manufacturer_number: 'MN-PO-003',
          stockist_number: 'SN-PO-003',
          coo: 'DE',
          brand: 'Acme',
          description: 'Pressure Gauge',
          au: 'EA',
          quantity: 5,
          unit_price: 100,
          total_price: 500,
          delivery_time: '2 weeks',
          remarks: ''
        }
      ]
    };

    console.log('Updating Purchase Order...');
    await updatePurchaseOrder(cookie, csrfToken, poId, poUpdate);
    console.log('PO update OK');

    console.log('Fetching updated PO...');
    const updatedPO = await getPurchaseOrder(cookie, poId);
    console.log('Items count after update:', Array.isArray(updatedPO.items) ? updatedPO.items.length : 0);
    if (!updatedPO.items || updatedPO.items.length !== 2) {
      throw new Error('Unexpected items count after update');
    }

    console.log('Exporting PO to Excel...');
    const filePath = await exportPurchaseOrderExcel(cookie, poId, `purchase_order_${poId}_test.xlsx`);
    console.log('PO Excel saved to:', filePath);

    console.log('All Purchase Order tests completed successfully.');
  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
