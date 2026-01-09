// Node.js script to test ERP API endpoints for Invoices
// Includes: login, create invoice, get invoice, update invoice, export invoice to Excel, delete invoice

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
          return;
        }

        resolve({ status: res.statusCode, headers: res.headers, body: buffer });
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

async function createInvoice(cookie, csrfToken, invoice) {
  const payload = JSON.stringify(invoice);
  const res = await request('POST', '/api/invoices', payload, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Create invoice failed: ' + JSON.stringify(res.body));
  return res.body.id;
}

async function getInvoice(cookie, id) {
  const res = await request('GET', `/api/invoices/${id}`, null, { 'Cookie': cookie });
  if (res.status !== 200) throw new Error('Get invoice failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function updateInvoice(cookie, csrfToken, id, invoice) {
  const payload = JSON.stringify(invoice);
  const res = await request('PUT', `/api/invoices/${id}`, payload, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Update invoice failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function deleteInvoice(cookie, csrfToken, id) {
  const res = await request('DELETE', `/api/invoices/${id}`, null, {
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    'Cookie': cookie
  });
  if (res.status !== 200) throw new Error('Delete invoice failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function exportInvoiceExcel(cookie, id, filenameHint = `invoice_${id}_test.xlsx`) {
  const res = await request('GET', `/api/invoices/${id}/excel`, null, { 'Cookie': cookie });
  if (res.status !== 200) throw new Error('Export invoice Excel failed: ' + res.status + ' ' + (res.headers['content-type'] || ''));

  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  const filePath = path.join(downloadsDir, filenameHint);
  fs.writeFileSync(filePath, res.body);
  return filePath;
}

async function main() {
  let invoiceId = null;
  try {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminTest!2025';

    console.log('Logging in as admin...', adminUser);
    const { cookie, csrfToken } = await login(adminUser, adminPass);
    console.log('Login OK');

    const stamp = Date.now();
    const date = new Date().toISOString().slice(0, 10);

    const invoiceCreate = {
      ref_no: `REF-${stamp}`,
      ar_no: `AR-${stamp}`,
      date,
      invoice_number: `INV-${stamp}`,
      to_client: 'ChipMart Test Client',
      total_without_gst: 1000,
      gst_amount: 180,
      grand_total: 1180,
      items: [
        {
          serial_number: 1,
          description: 'Test line item 1',
          au: 'EA',
          quantity: 2,
          unit_price: 500,
          total_price: 1000,
          supplier_up: 400,
          profit_factor: 1.1,
          exchange_rate: 1,
          calculated_price: 440
        }
      ]
    };

    console.log('Creating Invoice...');
    invoiceId = await createInvoice(cookie, csrfToken, invoiceCreate);
    console.log('Created Invoice ID:', invoiceId);

    console.log('Fetching created Invoice...');
    const createdInvoice = await getInvoice(cookie, invoiceId);
    console.log('Items count after create:', Array.isArray(createdInvoice.items) ? createdInvoice.items.length : 0);
    if (!createdInvoice.items || createdInvoice.items.length !== 1) {
      throw new Error('Unexpected items count after create');
    }

    const invoiceUpdate = {
      ref_no: `REF-${stamp}-UPDATED`,
      ar_no: `AR-${stamp}-UPDATED`,
      date,
      invoice_number: `INV-${stamp}-UPDATED`,
      to_client: 'ChipMart Test Client (Updated)',
      total_without_gst: 1500,
      gst_amount: 270,
      grand_total: 1770,
      items: [
        {
          serial_number: 1,
          description: 'Test line item 1 (Updated)',
          au: 'EA',
          quantity: 3,
          unit_price: 400,
          total_price: 1200,
          supplier_up: 300,
          profit_factor: 1.2,
          exchange_rate: 1,
          calculated_price: 360
        },
        {
          serial_number: 2,
          description: 'Test line item 2',
          au: 'EA',
          quantity: 1,
          unit_price: 300,
          total_price: 300,
          supplier_up: 200,
          profit_factor: 1.15,
          exchange_rate: 1,
          calculated_price: 230
        }
      ]
    };

    console.log('Updating Invoice...');
    await updateInvoice(cookie, csrfToken, invoiceId, invoiceUpdate);
    console.log('Invoice update OK');

    console.log('Fetching updated Invoice...');
    const updatedInvoice = await getInvoice(cookie, invoiceId);
    console.log('Items count after update:', Array.isArray(updatedInvoice.items) ? updatedInvoice.items.length : 0);
    if (!updatedInvoice.items || updatedInvoice.items.length !== 2) {
      throw new Error('Unexpected items count after update');
    }

    console.log('Exporting Invoice to Excel...');
    const filePath = await exportInvoiceExcel(cookie, invoiceId, `invoice_${invoiceId}_test.xlsx`);
    console.log('Invoice Excel saved to:', filePath);

    console.log('Deleting Invoice...');
    await deleteInvoice(cookie, csrfToken, invoiceId);
    console.log('Invoice delete OK');

    console.log('All Invoice tests completed successfully.');
  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

