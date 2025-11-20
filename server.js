const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const crypto = require('crypto');
const archiver = require('archiver');
// Load environment variables from .env if present
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed or .env not present; continue with process.env defaults
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (e.g., Apache/Nginx) so secure cookies work behind HTTPS terminator
// Default to 1 hop; override with TRUST_PROXY env if needed
try {
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv) {
    const hops = parseInt(trustProxyEnv, 10);
    if (!isNaN(hops)) {
      app.set('trust proxy', hops);
    } else if (trustProxyEnv === 'true') {
      app.set('trust proxy', 1);
    }
  } else {
    app.set('trust proxy', 1);
  }
} catch (e) {
  app.set('trust proxy', 1);
}

// CORS configuration (allow all if ALLOWED_ORIGINS is not set)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 204
}));

// Optional persistent session store for production
let SQLiteStore;
try {
  SQLiteStore = require('connect-sqlite3')(session);
} catch (e) {
  console.warn('connect-sqlite3 not installed; falling back to in-memory session store.');
}
const SESSION_DIR = path.resolve(process.env.SESSION_DIR || path.join(__dirname, 'sessions'));
if (SQLiteStore) {
  fs.ensureDirSync(SESSION_DIR);
}

// Session configuration
let sessionStore;
if (SQLiteStore) {
  // Use a proper sqlite3.Database connection for connect-sqlite3
  const SESSION_DB_PATH = path.join(SESSION_DIR, process.env.SESSION_DB || 'sessions.sqlite');
  const sessionDbConn = new sqlite3.Database(SESSION_DB_PATH);
  sessionStore = new SQLiteStore({
    db: sessionDbConn,
    table: 'sessions',
    concurrentDB: true // enable WAL mode for better concurrency
  });
}

app.use(session({
  name: process.env.SESSION_NAME || 'erp.sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: true, // trust proxy headers for secure cookies
  rolling: true, // refresh cookie expiry on activity
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: process.env.SESSION_SECURE === 'true', // Set to true in production with HTTPS
    sameSite: process.env.SESSION_SAME_SITE || 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(express.json());

// Resolve and ensure upload directories before registering static route
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(path.join(UPLOAD_DIR, 'queries'));
fs.ensureDirSync(path.join(UPLOAD_DIR, 'quotations'));
fs.ensureDirSync(path.join(UPLOAD_DIR, 'purchase_orders'));
fs.ensureDirSync(path.join(UPLOAD_DIR, 'invoices'));
fs.ensureDirSync(path.join(UPLOAD_DIR, 'attachments'));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));

// Upload directories ensured above

// Function to determine upload destination based on request context
function getUploadDestination(req, file) {
  const url = req.originalUrl || req.url;
  const baseDir = UPLOAD_DIR;

  if (url.includes('/queries') || url.includes('/query')) {
    return path.join(baseDir, 'queries');
  } else if (url.includes('/quotations') || url.includes('/quotation')) {
    return path.join(baseDir, 'quotations');
  } else if (url.includes('/purchase-orders') || url.includes('/purchase_order')) {
    return path.join(baseDir, 'purchase_orders');
  } else if (url.includes('/invoices') || url.includes('/invoice')) {
    return path.join(baseDir, 'invoices');
  } else {
    return path.join(baseDir, 'attachments');
  }
}

// Convert an absolute file path inside UPLOAD_DIR to a web path served under /uploads
function toWebPath(absolutePath) {
  try {
    const relative = path.relative(UPLOAD_DIR, absolutePath);
    // Ensure forward slashes for URLs across platforms
    return path.join('uploads', relative).replace(/\\/g, '/');
  } catch (e) {
    return absolutePath;
  }
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destination = getUploadDestination(req, file);
    fs.ensureDirSync(destination);
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     file.mimetype === 'application/msword' ||
                     file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                     file.mimetype === 'application/vnd.ms-excel';
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg, .pdf, .doc, .docx, .xls, .xlsx files are allowed!'));
    }
  }
});

// Database initialization
  const DB_PATH = process.env.DB_PATH || 'erp_system.db';
  const db = new sqlite3.Database(DB_PATH);

// Create tables
db.serialize(() => {
  // Queries table
  db.run(`CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_department TEXT,
    client_case_number TEXT,
    date TEXT,
    last_submission_date TEXT,
    client_name TEXT,
    query_sent_to TEXT,
    attachment_path TEXT,
    status TEXT DEFAULT 'pending',
    nsets_case_number TEXT,
    enquiry_date TEXT,
    last_submission_excel_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL
  )`);

  // Query items table
  db.run(`CREATE TABLE IF NOT EXISTS query_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER,
    serial_number INTEGER,
    manufacturer_number TEXT,
    stockist_number TEXT,
    coo TEXT,
    brand TEXT,
    description TEXT,
    au TEXT,
    quantity INTEGER,
    remarks TEXT,
    FOREIGN KEY (query_id) REFERENCES queries (id)
  )`);

  // Add COO and Brand columns to existing query_items table if they don't exist
  db.run(`ALTER TABLE query_items ADD COLUMN coo TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding coo column:', err);
    }
  });
  
  db.run(`ALTER TABLE query_items ADD COLUMN brand TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding brand column:', err);
    }
  });

  // Add COO and Brand columns to existing purchase_order_items table if they don't exist
  db.run(`ALTER TABLE purchase_order_items ADD COLUMN coo TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding coo column to purchase_order_items:', err);
    }
  });
  
  db.run(`ALTER TABLE purchase_order_items ADD COLUMN brand TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding brand column to purchase_order_items:', err);
    }
  });

  // Quotations table
  db.run(`CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_number TEXT,
    date TEXT,
    to_client TEXT,
    query_id INTEGER,
    currency TEXT DEFAULT 'USD',
    quotation_type TEXT DEFAULT 'local',
    attachment TEXT,
    supplier_price REAL,
    profit_factor REAL,
    exchange_rate REAL,
    total_without_gst REAL,
    gst_amount REAL,
    grand_total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (query_id) REFERENCES queries (id)
  )`);

  // Add new columns to existing quotations table if they don't exist
  db.run(`ALTER TABLE quotations ADD COLUMN quotation_type TEXT DEFAULT 'local'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding quotation_type column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotations ADD COLUMN attachment TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding attachment column:', err);
    }
  });

  // Quotation items table
  db.run(`CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER,
    serial_number INTEGER,
    manufacturer_number TEXT,
    stockist_number TEXT,
    description TEXT,
    au TEXT,
    quantity INTEGER,
    unit_price REAL,
    total_price REAL,
    supplier_price REAL,
    profit_factor REAL,
    exchange_rate REAL,
    supplier_up REAL,
    FOREIGN KEY (quotation_id) REFERENCES quotations (id)
  )`);

  // Add new columns to existing quotation_items table if they don't exist
  db.run(`ALTER TABLE quotation_items ADD COLUMN coo TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding coo column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotation_items ADD COLUMN brand TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding brand column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotation_items ADD COLUMN supplier_price REAL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding supplier_price column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotation_items ADD COLUMN profit_factor REAL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding profit_factor column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotation_items ADD COLUMN exchange_rate REAL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding exchange_rate column:', err);
    }
  });
  
  db.run(`ALTER TABLE quotation_items ADD COLUMN supplier_up REAL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding supplier_up column:', err);
    }
  });

  // Suggestions tables for autocomplete
  db.run(`CREATE TABLE IF NOT EXISTS org_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS client_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS supplier_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT UNIQUE
  )`);

  // Purchase Orders table
  db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT,
    date TEXT,
    supplier_name TEXT,
    supplier_address TEXT,
    po_currency TEXT DEFAULT 'INR',
    total_price REAL,
    freight_charges REAL,
    grand_total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add po_currency column to existing purchase_orders table if it doesn't exist
  db.run(`ALTER TABLE purchase_orders ADD COLUMN po_currency TEXT DEFAULT 'INR'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding po_currency column:', err);
    }
  });

  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    permissions TEXT DEFAULT '{"queries": true}',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Sessions table for managing user sessions
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Create default admin user if no users exist
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (!err && row.count === 0) {
      const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Shahzad';
      const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'NSets123';
      const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

      const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
      const adminPermissions = JSON.stringify({
        queries: true,
        quotations: true,
        purchase_orders: true,
        invoices: true,
        admin: true
      });

      db.run(`INSERT INTO users (username, password, full_name, role, permissions)
              VALUES (?, ?, ?, ?, ?)`,
             [DEFAULT_ADMIN_USERNAME, hashedPassword, 'System Administrator', 'admin', adminPermissions],
             (err) => {
               if (err) {
                 console.error('Error creating default admin user:', err);
               } else {
                 console.log('Default admin user created. Please change the admin password immediately.');
               }
             });
    }
  });

  // Purchase Order items table
  db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER,
    serial_number INTEGER,
    manufacturer_number TEXT,
    stockist_number TEXT,
    coo TEXT,
    brand TEXT,
    description TEXT,
    au TEXT,
    quantity INTEGER,
    unit_price REAL,
    total_price REAL,
    delivery_time TEXT,
    remarks TEXT,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id)
  )`);

  // Activity logs table for tracking user actions
  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    entity_name TEXT,
    file_path TEXT,
    file_name TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

// Function to log user activities
function logActivity(userId, username, action, entityType, entityId = null, entityName = null, filePath = null, fileName = null, details = null, req = null) {
  const ipAddress = req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress) : null;
  const userAgent = req ? req.headers['user-agent'] : null;
  
  db.run(`INSERT INTO activity_logs (user_id, username, action, entity_type, entity_id, entity_name, file_path, file_name, details, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [userId, username, action, entityType, entityId, entityName, filePath, fileName, details, ipAddress, userAgent],
         (err) => {
           if (err) {
             console.error('Error logging activity:', err);
           }
         });
}

// Routes

// Get all queries
app.get('/api/queries', requireAuth, checkPermission('queries'), (req, res) => {
  const { status, deleted } = req.query;
  let query = 'SELECT * FROM queries WHERE 1=1';
  const params = [];

  if (deleted === 'true') {
    query += ' AND deleted_at IS NOT NULL';
  } else {
    query += ' AND deleted_at IS NULL';
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get single query with items
app.get('/api/queries/:id', requireAuth, checkPermission('queries'), (req, res) => {
  const queryId = req.params.id;
  
  db.get('SELECT * FROM queries WHERE id = ?', [queryId], (err, query) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!query) {
      res.status(404).json({ error: 'Query not found' });
      return;
    }

    db.all('SELECT * FROM query_items WHERE query_id = ? ORDER BY serial_number', [queryId], (err, items) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Get supplier responses if they exist
      db.all('SELECT * FROM supplier_responses WHERE query_id = ? ORDER BY created_at', [queryId], (err, supplierResponses) => {
        if (err) {
          console.error('Error fetching supplier responses:', err);
          // Continue without supplier responses if there's an error
          res.json({ ...query, items, supplier_responses: [] });
          return;
        }
        
        res.json({ ...query, items, supplier_responses: supplierResponses || [] });
      });
    });
  });
});

// Create new query
app.post('/api/queries', requireAuth, checkPermission('queries'), upload.single('attachment'), (req, res) => {
  const {
    org_department,
    client_case_number,
    date,
    last_submission_date,
    client_name,
    query_sent_to,
    nsets_case_number,
    enquiry_date,
    last_submission_excel_date,
    items
  } = req.body;

  const attachment_path = req.file ? toWebPath(req.file.path) : null;

  const query = `INSERT INTO queries (
    org_department, client_case_number, date, last_submission_date,
    client_name, query_sent_to, attachment_path, nsets_case_number,
    enquiry_date, last_submission_excel_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [
    org_department, client_case_number, date, last_submission_date,
    client_name, query_sent_to, attachment_path, nsets_case_number,
    enquiry_date, last_submission_excel_date
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const queryId = this.lastID;
    
    // Insert items if provided
    if (items && Array.isArray(JSON.parse(items))) {
      const parsedItems = JSON.parse(items);
      const itemQuery = `INSERT INTO query_items (
        query_id, serial_number, manufacturer_number, stockist_number,
        coo, brand, description, au, quantity, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      parsedItems.forEach((item, index) => {
        db.run(itemQuery, [
          queryId, index + 1, item.manufacturer_number, item.stockist_number,
          item.coo, item.brand, item.description, item.au, item.quantity, item.remarks
        ]);
      });
    }

    // Add suggestions
    if (org_department) {
      db.run('INSERT OR IGNORE INTO org_suggestions (value) VALUES (?)', [org_department]);
    }
    if (client_name) {
      db.run('INSERT OR IGNORE INTO client_suggestions (value) VALUES (?)', [client_name]);
    }
    if (query_sent_to) {
      db.run('INSERT OR IGNORE INTO supplier_suggestions (value) VALUES (?)', [query_sent_to]);
    }

    // Log activity
    logActivity(req.session.userId, req.session.username, 'create', 'query', queryId, `Query ${queryId}`, attachment_path, req.file ? req.file.filename : null, 'Query created', req);
    
    res.json({ id: queryId, message: 'Query created successfully' });
  });
});

// Update query
app.put('/api/queries/:id', requireAuth, checkPermission('queries'), upload.single('attachment'), (req, res) => {
  const queryId = req.params.id;
  const {
    org_department,
    client_case_number,
    date,
    last_submission_date,
    client_name,
    query_sent_to,
    status,
    nsets_case_number,
    enquiry_date,
    last_submission_excel_date,
    items
  } = req.body;

  let attachment_path = req.body.existing_attachment;
  if (req.file) {
    attachment_path = toWebPath(req.file.path);
  }

  const query = `UPDATE queries SET 
    org_department = ?, client_case_number = ?, date = ?, last_submission_date = ?,
    client_name = ?, query_sent_to = ?, attachment_path = ?, status = ?,
    nsets_case_number = ?, enquiry_date = ?, last_submission_excel_date = ?,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`;

  db.run(query, [
    org_department, client_case_number, date, last_submission_date,
    client_name, query_sent_to, attachment_path, status,
    nsets_case_number, enquiry_date, last_submission_excel_date, queryId
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Update items
    if (items) {
      // Delete existing items
      db.run('DELETE FROM query_items WHERE query_id = ?', [queryId], (err) => {
        if (err) {
          console.error('Error deleting items:', err);
          return;
        }

        // Insert new items
        const parsedItems = JSON.parse(items);
        const itemQuery = `INSERT INTO query_items (
          query_id, serial_number, manufacturer_number, stockist_number,
          coo, brand, description, au, quantity, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        parsedItems.forEach((item, index) => {
          db.run(itemQuery, [
            queryId, index + 1, item.manufacturer_number, item.stockist_number,
            item.coo, item.brand, item.description, item.au, item.quantity, item.remarks
          ]);
        });
      });
    }

    // Log activity
    logActivity(req.session.userId, req.session.username, 'update', 'query', queryId, `Query ${queryId}`, attachment_path, req.file ? req.file.filename : null, 'Query updated', req);
    
    res.json({ message: 'Query updated successfully' });
  });
});

// Delete query (soft delete)
app.delete('/api/queries/:id', requireAuth, checkPermission('queries'), (req, res) => {
  const queryId = req.params.id;
  
  db.run('UPDATE queries SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [queryId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Log activity
  logActivity(req.session.userId, req.session.username, 'delete', 'query', queryId, `Query ${queryId}`, null, null, 'Query deleted', req);
    
    res.json({ message: 'Query deleted successfully' });
  });
});

// Update query status with file uploads
app.put('/api/queries/:id/status', requireAuth, checkPermission('queries'), upload.fields([
  { name: 'supplier_attachment_0', maxCount: 1 },
  { name: 'supplier_attachment_1', maxCount: 1 },
  { name: 'supplier_attachment_2', maxCount: 1 },
  { name: 'supplier_attachment_3', maxCount: 1 },
  { name: 'supplier_attachment_4', maxCount: 1 },
  { name: 'supplier_attachment_5', maxCount: 1 },
  { name: 'supplier_attachment_6', maxCount: 1 },
  { name: 'supplier_attachment_7', maxCount: 1 },
  { name: 'supplier_attachment_8', maxCount: 1 },
  { name: 'supplier_attachment_9', maxCount: 1 }
]), (req, res) => {
  try {
    const queryId = req.params.id;
    const { status, supplier_responses } = req.body;
    
    console.log('Status update request received:');
    console.log('Query ID:', queryId);
    console.log('New Status:', status);
    console.log('Supplier Responses:', supplier_responses);
    console.log('Files:', req.files);
    
    // Validate required parameters
    if (!queryId || !status) {
      return res.status(400).json({ error: 'Missing required parameters: queryId or status' });
    }
    
    // Update query status
    db.run('UPDATE queries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, queryId], function(err) {
      if (err) {
        console.error('Database error updating status:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      console.log('Query status updated successfully in database');
      
      // If supplier responses are provided, store them
      if (supplier_responses) {
        try {
          const parsedResponses = JSON.parse(supplier_responses);
          
          // Create supplier_responses table if it doesn't exist
          db.run(`CREATE TABLE IF NOT EXISTS supplier_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id INTEGER,
            supplier_name TEXT,
            response_status TEXT,
            attachment_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (query_id) REFERENCES queries (id)
          )`, (err) => {
            if (err) {
              console.error('Error creating supplier_responses table:', err);
            }
            
            // Clear existing responses for this query
            db.run('DELETE FROM supplier_responses WHERE query_id = ?', [queryId], (err) => {
              if (err) {
                console.error('Error clearing existing responses:', err);
              }
              
              // Insert new responses with file paths
              const insertQuery = 'INSERT INTO supplier_responses (query_id, supplier_name, response_status, attachment_path) VALUES (?, ?, ?, ?)';
              parsedResponses.forEach((response, index) => {
                let attachmentPath = null;
                
                // Check if there's a file for this supplier
                const fileFieldName = `supplier_attachment_${index}`;
                if (req.files && req.files[fileFieldName] && req.files[fileFieldName][0]) {
                  attachmentPath = toWebPath(req.files[fileFieldName][0].path);
                }
                
                db.run(insertQuery, [queryId, response.supplier, response.response, attachmentPath], (err) => {
                  if (err) {
                    console.error('Error inserting supplier response:', err);
                  }
                });
              });
            });
          });
        } catch (parseError) {
          console.error('Error parsing supplier responses:', parseError);
          return res.status(400).json({ error: 'Invalid supplier responses format' });
        }
      }
      
      res.json({ message: 'Query status updated successfully' });
    });
  } catch (error) {
    console.error('Unexpected error in status update:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Upload supplier response attachment
app.post('/api/queries/:id/supplier-attachment', requireAuth, checkPermission('queries'), upload.single('attachment'), (req, res) => {
  const queryId = req.params.id;
  const { supplier_name } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const attachmentPath = toWebPath(req.file.path);
  
  res.json({ 
    message: 'Attachment uploaded successfully',
    attachment_path: attachmentPath,
    supplier_name: supplier_name
  });
});

// Generate Excel for query
app.get('/api/queries/:id/excel', requireAuth, checkPermission('queries'), async (req, res) => {
  const queryId = req.params.id;
  
  try {
    // Get query details
    const query = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM queries WHERE id = ?', [queryId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get query items
    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM query_items WHERE query_id = ? ORDER BY serial_number', [queryId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Query Datasheet');

    // Add headers
    worksheet.addRow(['NSETS Case Number:', query.nsets_case_number]);
    worksheet.addRow(['Enquiry Date:', query.enquiry_date]);
    worksheet.addRow(['Last Date of Submission:', query.last_submission_excel_date]);
    worksheet.addRow([]);

    // Define all possible columns with their properties
    const allColumns = [
      { key: 'serial_number', header: 'Serial#', width: 10, getValue: (item) => item.serial_number },
      { key: 'manufacturer_number', header: 'Manufacturer#', width: 15, getValue: (item) => item.manufacturer_number },
      { key: 'stockist_number', header: 'Stockist#', width: 15, getValue: (item) => item.stockist_number },
      { key: 'coo', header: 'COO', width: 12, getValue: (item) => item.coo },
      { key: 'brand', header: 'Brand', width: 12, getValue: (item) => item.brand },
      { key: 'description', header: 'Description', width: 30, getValue: (item) => item.description },
      { key: 'au', header: 'A/U', width: 10, getValue: (item) => item.au },
      { key: 'quantity', header: 'Quantity', width: 10, getValue: (item) => item.quantity },
      { key: 'remarks', header: 'Remarks', width: 20, getValue: (item) => item.remarks }
    ];

    // Filter columns that have at least one non-empty value
    const activeColumns = allColumns.filter(column => {
      return items.some(item => {
        const value = column.getValue(item);
        return value !== null && value !== undefined && value !== '';
      });
    });

    // Add table headers (only for active columns)
    const headerRow = worksheet.addRow(activeColumns.map(col => col.header));
    headerRow.font = { bold: true };

    // Add items (only active columns)
    items.forEach(item => {
      const rowData = activeColumns.map(column => column.getValue(item) || '');
      worksheet.addRow(rowData);
    });

    // Set column widths (only for active columns)
    worksheet.columns = activeColumns.map(col => ({ width: col.width }));

    // Generate Excel file
    const filename = `query_${queryId}_${Date.now()}.xlsx`;
    const filepath = path.join(UPLOAD_DIR, 'queries', filename);
    
    await workbook.xlsx.writeFile(filepath);
    
    // Log activity
    logActivity(req.session.userId, req.session.username, 'export', 'query', queryId, `Query ${queryId}`, filepath, filename, 'Excel export', req);
    
    res.download(filepath, filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get suggestions
app.get('/api/suggestions/:type', requireAuth, (req, res) => {
  const type = req.params.type;
  const tables = {
    'org': 'org_suggestions',
    'client': 'client_suggestions',
    'supplier': 'supplier_suggestions'
  };

  const tableName = tables[type];
  if (!tableName) {
    res.status(400).json({ error: 'Invalid suggestion type' });
    return;
  }

  db.all(`SELECT value FROM ${tableName} ORDER BY value`, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => row.value));
  });
});

// Quotation Routes

// Get all quotations
app.get('/api/quotations', requireAuth, checkPermission('quotations'), (req, res) => {
  const query = `SELECT q.*, queries.client_name, queries.nsets_case_number 
                 FROM quotations q 
                 LEFT JOIN queries ON q.query_id = queries.id 
                 ORDER BY q.created_at DESC`;
  
  db.all(query, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get single quotation with items
app.get('/api/quotations/:id', requireAuth, checkPermission('quotations'), (req, res) => {
  const quotationId = req.params.id;
  
  db.get('SELECT * FROM quotations WHERE id = ?', [quotationId], (err, quotation) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    db.all('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY serial_number', [quotationId], (err, items) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({ ...quotation, items });
    });
  });
});

// Create new quotation
app.post('/api/quotations', requireAuth, checkPermission('quotations'), (req, res) => {
  const {
    quotation_number,
    date,
    to_client,
    query_id,
    currency,
    quotation_type,
    attachment,
    supplier_price,
    profit_factor,
    exchange_rate,
    total_without_gst,
    gst_amount,
    grand_total,
    items
  } = req.body;

  const query = `INSERT INTO quotations (
    quotation_number, date, to_client, query_id, currency, quotation_type, attachment,
    supplier_price, profit_factor, exchange_rate,
    total_without_gst, gst_amount, grand_total
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [
    quotation_number, date, to_client, query_id, currency, quotation_type || 'local', attachment,
    supplier_price, profit_factor, exchange_rate,
    total_without_gst, gst_amount, grand_total
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const quotationId = this.lastID;
    
    // Insert items if provided
    if (items && Array.isArray(items)) {
      const itemQuery = `INSERT INTO quotation_items (
        quotation_id, serial_number, manufacturer_number, stockist_number, coo, brand,
        description, au, quantity, unit_price, total_price,
        supplier_price, profit_factor, exchange_rate, supplier_up
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      items.forEach((item, index) => {
        db.run(itemQuery, [
          quotationId, index + 1, item.manufacturer_number, item.stockist_number, item.coo, item.brand,
          item.description, item.au, item.quantity, item.unit_price, item.total_price,
          item.supplier_price, item.profit_factor, item.exchange_rate, item.supplier_up
        ]);
      });
    }

    // Log activity
    logActivity(req.session.userId, req.session.username, 'create', 'quotation', quotationId, `Quotation ${quotationId}`, attachment, null, 'Quotation created', req);
    
    res.json({ id: quotationId, message: 'Quotation created successfully' });
  });
});

// Update quotation
app.put('/api/quotations/:id', requireAuth, checkPermission('quotations'), (req, res) => {
  const quotationId = req.params.id;
  const {
    quotation_number,
    date,
    to_client,
    query_id,
    currency,
    quotation_type,
    attachment,
    supplier_price,
    profit_factor,
    exchange_rate,
    total_without_gst,
    gst_amount,
    grand_total,
    items
  } = req.body;

  const query = `UPDATE quotations SET 
    quotation_number = ?, date = ?, to_client = ?, query_id = ?, currency = ?, quotation_type = ?, attachment = ?,
    supplier_price = ?, profit_factor = ?, exchange_rate = ?,
    total_without_gst = ?, gst_amount = ?, grand_total = ?
    WHERE id = ?`;

  db.run(query, [
    quotation_number, date, to_client, query_id, currency, quotation_type || 'local', attachment,
    supplier_price, profit_factor, exchange_rate,
    total_without_gst, gst_amount, grand_total, quotationId
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Update items
    if (items) {
      // Delete existing items
      db.run('DELETE FROM quotation_items WHERE quotation_id = ?', [quotationId], (err) => {
        if (err) {
          console.error('Error deleting quotation items:', err);
          return;
        }

        // Insert new items
        const itemQuery = `INSERT INTO quotation_items (
          quotation_id, serial_number, manufacturer_number, stockist_number, coo, brand,
          description, au, quantity, unit_price, total_price,
          supplier_price, profit_factor, exchange_rate, supplier_up
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        items.forEach((item, index) => {
          db.run(itemQuery, [
            quotationId, index + 1, item.manufacturer_number, item.stockist_number, item.coo, item.brand,
            item.description, item.au, item.quantity, item.unit_price, item.total_price,
            item.supplier_price, item.profit_factor, item.exchange_rate, item.supplier_up
          ]);
        });
      });
    }

    // Log activity
    logActivity(req.session.userId, req.session.username, 'update', 'quotation', quotationId, `Quotation ${quotationId}`, attachment, null, 'Quotation updated', req);
    
    res.json({ message: 'Quotation updated successfully' });
  });
});

// Delete quotation
app.delete('/api/quotations/:id', requireAuth, checkPermission('quotations'), (req, res) => {
  const quotationId = req.params.id;
  
  db.run('DELETE FROM quotations WHERE id = ?', [quotationId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Log activity
  logActivity(req.session.userId, req.session.username, 'delete', 'quotation', quotationId, `Quotation ${quotationId}`, null, null, 'Quotation deleted', req);
    
    res.json({ message: 'Quotation deleted successfully' });
  });
});

// Generate Excel for quotation
app.get('/api/quotations/:id/excel', requireAuth, checkPermission('quotations'), async (req, res) => {
  const quotationId = req.params.id;
  
  try {
    // Get quotation details
    const quotation = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM quotations WHERE id = ?', [quotationId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get quotation items
    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY serial_number', [quotationId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Quotation');

    // Add headers
    worksheet.addRow(['QUOTATION']);
    worksheet.addRow(['Quotation Number:', quotation.quotation_number]);
    worksheet.addRow(['Date:', quotation.date]);
    worksheet.addRow(['To:', quotation.to_client]);
    worksheet.addRow(['Currency:', quotation.currency]);
    worksheet.addRow([]);

    // Define all possible columns with their properties
    const allColumns = [
      { key: 'serial_number', header: 'Serial#', width: 10, getValue: (item) => item.serial_number },
      { key: 'manufacturer_number', header: 'Manufacturer#', width: 15, getValue: (item) => item.manufacturer_number },
      { key: 'stockist_number', header: 'Stockist#', width: 15, getValue: (item) => item.stockist_number },
      { key: 'coo', header: 'COO', width: 12, getValue: (item) => item.coo },
      { key: 'brand', header: 'Brand', width: 12, getValue: (item) => item.brand },
      { key: 'description', header: 'Description', width: 30, getValue: (item) => item.description },
      { key: 'au', header: 'A/U', width: 10, getValue: (item) => item.au },
      { key: 'quantity', header: 'Quantity', width: 10, getValue: (item) => item.quantity },
      { key: 'unit_price', header: 'U/P', width: 12, getValue: (item) => item.unit_price },
      { key: 'total_price', header: 'T/P', width: 12, getValue: (item) => item.total_price },
      { key: 'supplier_price', header: 'Supplier Price', width: 15, getValue: (item) => item.supplier_price },
      { key: 'profit_factor', header: 'Profit Factor', width: 15, getValue: (item) => item.profit_factor },
      { key: 'exchange_rate', header: 'Exchange Rate', width: 15, getValue: (item) => item.exchange_rate },
      { key: 'supplier_up', header: 'Supplier U/P', width: 15, getValue: (item) => item.supplier_up }
    ];

    // Filter columns that have at least one non-empty value
    const activeColumns = allColumns.filter(column => {
      return items.some(item => {
        const value = column.getValue(item);
        return value !== null && value !== undefined && value !== '';
      });
    });

    // Add table headers (only for active columns)
    const headerRow = worksheet.addRow(activeColumns.map(col => col.header));
    headerRow.font = { bold: true };

    // Add items (only active columns)
    items.forEach(item => {
      const rowData = activeColumns.map(column => column.getValue(item) || '');
      worksheet.addRow(rowData);
    });

    // Add totals
    worksheet.addRow([]);
    worksheet.addRow(['', '', '', '', '', '', 'Total without GST:', quotation.total_without_gst]);
    worksheet.addRow(['', '', '', '', '', '', 'GST Amount:', quotation.gst_amount]);
    worksheet.addRow(['', '', '', '', '', '', 'Grand Total:', quotation.grand_total]);

    // Set column widths (only for active columns)
    worksheet.columns = activeColumns.map(col => ({ width: col.width }));

    // Generate Excel file
    const filename = `quotation_${quotationId}_${Date.now()}.xlsx`;
    const filepath = path.join(UPLOAD_DIR, 'quotations', filename);
    
    await workbook.xlsx.writeFile(filepath);
    
    // Log activity
    logActivity(req.session.userId, req.session.username, 'export', 'quotation', quotationId, `Quotation ${quotationId}`, filepath, filename, 'Excel export', req);
    
    res.download(filepath, filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queries for quotation dropdown
app.get('/api/queries/for-quotation', requireAuth, checkPermission('quotations'), (req, res) => {
  db.all('SELECT id, client_case_number, nsets_case_number, client_name FROM queries WHERE deleted_at IS NULL ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Purchase Orders API endpoints

// Get all purchase orders
app.get('/api/purchase-orders', requireAuth, checkPermission('purchase_orders'), (req, res) => {
  const sql = `SELECT * FROM purchase_orders ORDER BY date DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get purchase order by ID
app.get('/api/purchase-orders/:id', requireAuth, checkPermission('purchase_orders'), (req, res) => {
  const { id } = req.params;
  
  const poSql = `SELECT * FROM purchase_orders WHERE id = ?`;
  const itemsSql = `SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY serial_number`;
  
  db.get(poSql, [id], (err, po) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }
    
    db.all(itemsSql, [id], (err, items) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      po.items = items;
      res.json(po);
    });
  });
});

// Create new purchase order
app.post('/api/purchase-orders', requireAuth, checkPermission('purchase_orders'), (req, res) => {
  const { po_number, date, supplier_name, supplier_address, po_currency, total_price, freight_charges, grand_total, items } = req.body;
  
  const sql = `INSERT INTO purchase_orders (po_number, date, supplier_name, supplier_address, po_currency, total_price, freight_charges, grand_total) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [po_number, date, supplier_name, supplier_address, po_currency || 'INR', total_price, freight_charges, grand_total], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const purchaseOrderId = this.lastID;
    
    // Insert items
    if (items && items.length > 0) {
      const itemSql = `INSERT INTO purchase_order_items 
                         (purchase_order_id, serial_number, manufacturer_number, stockist_number, coo, brand, description, au, quantity, unit_price, total_price, delivery_time, remarks) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const stmt = db.prepare(itemSql);
        
        items.forEach(item => {
          stmt.run([
            purchaseOrderId,
            item.serial_number,
            item.manufacturer_number,
            item.stockist_number,
            item.coo,
            item.brand,
            item.description,
            item.au,
            item.quantity,
            item.unit_price,
            item.total_price,
            item.delivery_time,
            item.remarks
          ]);
        });
      
      stmt.finalize();
    }
    
    // Log activity
    logActivity(req.session.userId, req.session.username, 'create', 'purchase_order', purchaseOrderId, `Purchase Order ${purchaseOrderId}`, null, null, 'Purchase order created', req);
    
    res.json({ id: purchaseOrderId, message: 'Purchase order created successfully' });
  });
});

// Update purchase order
app.put('/api/purchase-orders/:id', requireAuth, checkPermission('purchase_orders'), (req, res) => {
  const { id } = req.params;
  const { po_number, date, supplier_name, supplier_address, po_currency, total_price, freight_charges, grand_total, items } = req.body;
  
  const sql = `UPDATE purchase_orders SET 
               po_number = ?, date = ?, supplier_name = ?, supplier_address = ?, po_currency = ?, 
               total_price = ?, freight_charges = ?, grand_total = ?, updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`;
  
  db.run(sql, [po_number, date, supplier_name, supplier_address, po_currency || 'INR', total_price, freight_charges, grand_total, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Delete existing items
    db.run('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Insert updated items
      if (items && items.length > 0) {
        const itemSql = `INSERT INTO purchase_order_items 
                         (purchase_order_id, serial_number, manufacturer_number, stockist_number, coo, brand, description, au, quantity, unit_price, total_price, delivery_time, remarks) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const stmt = db.prepare(itemSql);
        
        items.forEach(item => {
          stmt.run([
            id,
            item.serial_number,
            item.manufacturer_number,
            item.stockist_number,
            item.coo,
            item.brand,
            item.description,
            item.au,
            item.quantity,
            item.unit_price,
            item.total_price,
            item.delivery_time,
            item.remarks
          ]);
        });
        
        stmt.finalize();
      }
      
      // Log activity
    logActivity(req.session.userId, req.session.username, 'update', 'purchase_order', id, `Purchase Order ${id}`, null, null, 'Purchase order updated', req);
      
      res.json({ message: 'Purchase order updated successfully' });
    });
  });
});

// Delete purchase order
app.delete('/api/purchase-orders/:id', requireAuth, checkPermission('purchase_orders'), (req, res) => {
  const { id } = req.params;
  
  // Delete items first
  db.run('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Delete purchase order
    db.run('DELETE FROM purchase_orders WHERE id = ?', [id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Log activity
  logActivity(req.session.userId, req.session.username, 'delete', 'purchase_order', id, `Purchase Order ${id}`, null, null, 'Purchase order deleted', req);
      
      res.json({ message: 'Purchase order deleted successfully' });
    });
  });
});

// Generate Excel for purchase order
app.get('/api/purchase-orders/:id/excel', requireAuth, checkPermission('purchase_orders'), async (req, res) => {
  const poId = req.params.id;
  
  try {
    // Get purchase order details
    const purchaseOrder = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM purchase_orders WHERE id = ?', [poId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Get purchase order items
    const items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY serial_number', [poId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Purchase Order');

    // Add headers
    worksheet.addRow(['PURCHASE ORDER']);
    worksheet.addRow(['PO Number:', purchaseOrder.po_number]);
    worksheet.addRow(['Date:', purchaseOrder.date]);
    worksheet.addRow(['Currency:', purchaseOrder.po_currency || 'INR']);
    worksheet.addRow(['Supplier Name:', purchaseOrder.supplier_name]);
    worksheet.addRow(['Supplier Address:', purchaseOrder.supplier_address]);
    worksheet.addRow([]);

    // Define all possible columns with their properties
    const allColumns = [
      { key: 'serial_number', header: 'Sr No.', width: 10, getValue: (item) => item.serial_number },
      { key: 'manufacturer_number', header: 'Manufacturer#', width: 15, getValue: (item) => item.manufacturer_number },
      { key: 'stockist_number', header: 'Stockist#', width: 15, getValue: (item) => item.stockist_number },
      { key: 'coo', header: 'COO', width: 12, getValue: (item) => item.coo },
      { key: 'brand', header: 'Brand', width: 12, getValue: (item) => item.brand },
      { key: 'description', header: 'Description', width: 30, getValue: (item) => item.description },
      { key: 'au', header: 'A/U', width: 10, getValue: (item) => item.au },
      { key: 'quantity', header: 'Quantity', width: 10, getValue: (item) => item.quantity },
      { key: 'unit_price', header: 'U/P', width: 12, getValue: (item) => parseFloat(item.unit_price || 0).toFixed(2) },
      { key: 'total_price', header: 'T/P', width: 12, getValue: (item) => parseFloat(item.total_price || 0).toFixed(2) },
      { key: 'delivery_time', header: 'Delivery Time', width: 15, getValue: (item) => item.delivery_time },
      { key: 'remarks', header: 'Remarks', width: 20, getValue: (item) => item.remarks }
    ];

    // Filter columns that have at least one non-empty value
    const activeColumns = allColumns.filter(column => {
      return items.some(item => {
        const value = column.getValue(item);
        return value !== null && value !== undefined && value !== '' && value !== '0.00';
      });
    });

    // Add table headers (only for active columns)
    const headerRow = worksheet.addRow(activeColumns.map(col => col.header));
    headerRow.font = { bold: true };

    // Add items (only active columns)
    items.forEach(item => {
      const rowData = activeColumns.map(column => column.getValue(item) || '');
      worksheet.addRow(rowData);
    });

    // Get currency symbol for display
    const getCurrencySymbol = (currencyCode) => {
      const currencyMap = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹',
        'JPY': '¥',
        'CNY': '¥',
        'AUD': 'A$',
        'CAD': 'C$'
      };
      return currencyMap[currencyCode] || currencyCode;
    };
    
    const currencySymbol = getCurrencySymbol(purchaseOrder.po_currency || 'INR');
    
    // Add totals
    worksheet.addRow([]);
    worksheet.addRow(['', '', '', '', '', '', 'Total Price:', `${currencySymbol}${parseFloat(purchaseOrder.total_price || 0).toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', '', 'Freight Charges:', `${currencySymbol}${parseFloat(purchaseOrder.freight_charges || 0).toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', '', 'Grand Total:', `${currencySymbol}${parseFloat(purchaseOrder.grand_total || 0).toFixed(2)}`]);

    // Set column widths (only for active columns)
    worksheet.columns = activeColumns.map(col => ({ width: col.width }));

    // Generate Excel file
    const filename = `purchase_order_${poId}_${Date.now()}.xlsx`;
    const filepath = path.join(UPLOAD_DIR, 'purchase_orders', filename);
    
    await workbook.xlsx.writeFile(filepath);
    
    // Log activity
    logActivity(req.session.userId, req.session.username, 'export', 'purchase_order', poId, `Purchase Order ${poId}`, filepath, filename, 'Excel export', req);
    
    res.download(filepath, filename);
  } catch (error) {
    console.error('Error generating purchase order Excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function checkPermission(permission) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    db.get('SELECT permissions FROM users WHERE id = ?', [req.session.userId], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      try {
        const permissions = JSON.parse(user.permissions);
        if (!permissions[permission]) {
          return res.status(403).json({ error: 'Permission denied' });
        }
        next();
      } catch (e) {
        return res.status(500).json({ error: 'Invalid permissions data' });
      }
    });
  };
}

// Authentication endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    try {
      let validPassword = false;
      try {
        validPassword = !!(user && bcrypt.compareSync(password, user.password));
      } catch (e) {
        // Handle legacy or malformed password hashes gracefully
        console.error('bcrypt compare failed for user', username, e);
        validPassword = false;
      }

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Defensive check for session middleware
      if (!req.session) {
        console.error('Session middleware not initialized for login request');
        return res.status(500).json({ error: 'Session not initialized' });
      }

      // Regenerate session to prevent fixation
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('Session regeneration error for user', username, regenErr);
          return res.status(500).json({ error: 'Login failed' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;

        let permissions = {};
        try {
          permissions = JSON.parse(user.permissions || '{}');
        } catch (e) {
          console.error('Invalid permissions JSON for user', user.username, e);
          permissions = {};
        }

        return res.json({
          message: 'Login successful',
          user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            permissions
          }
        });
      });
    } catch (unexpectedErr) {
      console.error('Unexpected server error during /api/login:', unexpectedErr);
      return res.status(500).json({ error: 'Unexpected server error during login' });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    try {
      const cookieName = process.env.SESSION_NAME || 'erp.sid';
      res.clearCookie(cookieName, {
        path: '/',
        httpOnly: true,
        sameSite: process.env.SESSION_SAME_SITE || 'lax',
        secure: process.env.SESSION_SECURE === 'true'
      });
    } catch (e) {
      console.warn('Failed to clear session cookie on logout:', e);
    }
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/auth/check', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }

  db.get('SELECT id, username, full_name, role, permissions FROM users WHERE id = ? AND is_active = 1', [req.session.userId], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ authenticated: false });
    }

    let permissions = {};
    try {
      permissions = JSON.parse(user.permissions || '{}');
    } catch (e) {
      console.error('Invalid permissions JSON in auth check for user', user.username, e);
      permissions = {};
    }

    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        permissions
      }
    });
  });
});

// User management endpoints (admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  db.all('SELECT id, username, email, full_name, role, permissions, is_active, created_at FROM users ORDER BY created_at DESC', (err, users) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const usersWithParsedPermissions = users.map(user => ({
      ...user,
      permissions: JSON.parse(user.permissions)
    }));
    
    res.json(usersWithParsedPermissions);
  });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, email, full_name, role, permissions } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  const permissionsJson = JSON.stringify(permissions || { queries: true });
  
  db.run('INSERT INTO users (username, password, email, full_name, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
    [username, hashedPassword, email, full_name, role || 'user', permissionsJson],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ id: this.lastID, message: 'User created successfully' });
    }
  );
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { email, full_name, role, permissions, is_active } = req.body;
  
  const permissionsJson = JSON.stringify(permissions);
  
  db.run('UPDATE users SET email = ?, full_name = ?, role = ?, permissions = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [email, full_name, role, permissionsJson, is_active, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ message: 'User updated successfully' });
    }
  );
});

app.put('/api/users/:id/password', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [hashedPassword, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ message: 'Password updated successfully' });
    }
  );
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  // Don't allow deleting the current user
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  db.run('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ message: 'User deactivated successfully' });
  });
});

// Reusable full backup creator
function createFullBackup(initiator = { userId: null, username: 'system' }) {
  return new Promise((resolve, reject) => {
    try {
      const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, 'backups'));
      fs.ensureDirSync(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `erp_full_backup_${timestamp}.zip`;
      const backupPath = path.join(backupDir, backupFileName);

      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        const backupSizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        resolve({ backupPath, backupFileName, backupSizeMB });
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Database file
      archive.file(path.resolve(DB_PATH), { name: path.basename(DB_PATH) });

      // Uploads directory
      if (fs.existsSync(UPLOAD_DIR)) {
        archive.directory(UPLOAD_DIR, 'uploads');
      }

      // Public directory
      archive.directory(path.join(__dirname, 'public'), 'public');

      // Source files
      archive.file(path.join(__dirname, 'server.js'), { name: 'server.js' });
      archive.file(path.join(__dirname, 'package.json'), { name: 'package.json' });
      if (fs.existsSync(path.join(__dirname, 'package-lock.json'))) {
        archive.file(path.join(__dirname, 'package-lock.json'), { name: 'package-lock.json' });
      }

      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

function pruneOldBackups(retentionDays = 30) {
  try {
    const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, 'backups'));
    if (!fs.existsSync(backupDir)) return { pruned: 0 };

    const now = Date.now();
    const cutoff = retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.zip'));

    let pruned = 0;
    for (const file of files) {
      const fullPath = path.join(backupDir, file);
      const stats = fs.statSync(fullPath);
      const age = now - stats.mtimeMs;
      if (age > cutoff) {
        fs.unlinkSync(fullPath);
        pruned++;
      }
    }
    return { pruned };
  } catch (err) {
    console.error('Error pruning backups:', err);
    return { pruned: 0, error: err.message };
  }
}

// System administration endpoints
app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  try {
    const result = await createFullBackup({ userId: req.session.userId, username: req.session.username });
    const { backupPath, backupFileName, backupSizeMB } = result;

    logActivity(req.session.userId, req.session.username, 'backup', 'system', null, 'Full System Backup', backupPath, backupFileName, `System backup created (${backupSizeMB} MB)`, req);

    res.json({ 
      message: 'Full system backup created successfully',
      backupFile: backupFileName,
      backupSize: `${backupSizeMB} MB`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

app.post('/api/admin/clear-sessions', requireAdmin, (req, res) => {
  try {
    // Prune expired sessions from the persistent session store (if configured)
    const SESSION_DB_PATH = path.join(
      path.resolve(process.env.SESSION_DIR || path.join(__dirname, 'sessions')),
      process.env.SESSION_DB || 'sessions.sqlite'
    );

    const sessionDb = new sqlite3.Database(SESSION_DB_PATH);
    const nowMs = Date.now();

    // Detect the expiry column name dynamically to support different store schemas
    sessionDb.all('PRAGMA table_info(sessions)', (pragmaErr, columns) => {
      if (pragmaErr) {
        sessionDb.close();
        return res.status(500).json({ error: pragmaErr.message });
      }

      const colNames = (columns || []).map(c => c.name.toLowerCase());
      const expiryCol = ['expires', 'expiry', 'expiration', 'expire'].find(name => colNames.includes(name));
      if (!expiryCol) {
        sessionDb.close();
        return res.status(500).json({ error: 'Unable to determine expiry column in sessions table' });
      }

      sessionDb.run(`DELETE FROM sessions WHERE ${expiryCol} < ?`, [nowMs], function(err) {
        if (err) {
          sessionDb.close();
          return res.status(500).json({ error: err.message });
        }
        const deleted = this.changes || 0;
        sessionDb.close();
        res.json({ 
          message: 'Expired sessions pruned successfully',
          deletedCount: deleted,
          expiryColumn: expiryCol
        });
      });
    });
  } catch (error) {
    console.error('Clear sessions error:', error);
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});

app.get('/api/admin/system-info', requireAdmin, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Get database file stats
    const dbPath = path.join(__dirname, 'erp_system.db');
    const dbStats = fs.statSync(dbPath);
    
    // Get system info
    db.get('SELECT COUNT(*) as totalUsers FROM users', (err, userCount) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      db.get('SELECT COUNT(*) as totalQueries FROM queries WHERE deleted_at IS NULL', (err, queryCount) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        db.get('SELECT COUNT(*) as totalSessions FROM sessions', (err, sessionCount) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          res.json({
            version: '1.0.0',
            database: {
              type: 'SQLite',
              size: Math.round(dbStats.size / 1024) + ' KB',
              lastModified: dbStats.mtime
            },
            statistics: {
              totalUsers: userCount.totalUsers,
              totalQueries: queryCount.totalQueries,
              activeSessions: sessionCount.totalSessions
            },
            server: {
              status: 'Running',
              uptime: process.uptime(),
              nodeVersion: process.version
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Failed to get system information' });
  }
});

// Get single user endpoint (for editing)
app.get('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT id, username, email, full_name, role, permissions, is_active, created_at FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      ...user,
      permissions: JSON.parse(user.permissions),
      status: user.is_active ? 'active' : 'inactive'
    });
  });
});

// Get activity logs for admin history
app.get('/api/admin/activity-logs', requireAdmin, (req, res) => {
  const { page = 1, limit = 50, action, entity_type, user_id } = req.query;
  const offset = (page - 1) * limit;
  
  let whereClause = '';
  let params = [];
  
  if (action || entity_type || user_id) {
    const conditions = [];
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (entity_type) {
      conditions.push('entity_type = ?');
      params.push(entity_type);
    }
    if (user_id) {
      conditions.push('user_id = ?');
      params.push(user_id);
    }
    whereClause = 'WHERE ' + conditions.join(' AND ');
  }
  
  const countSql = `SELECT COUNT(*) as total FROM activity_logs ${whereClause}`;
  const dataSql = `SELECT * FROM activity_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  
  db.get(countSql, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.all(dataSql, [...params, limit, offset], (err, logs) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / limit)
        }
      });
    });
  });
});

// Cleanup deleted queries older than 30 days
setInterval(() => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.run('DELETE FROM queries WHERE deleted_at IS NOT NULL AND deleted_at < ?', [thirtyDaysAgo]);
}, 24 * 60 * 60 * 1000); // Run daily

// Optional automated backups
const AUTO_BACKUP_INTERVAL = parseInt(process.env.AUTO_BACKUP_INTERVAL || '0', 10);
if (AUTO_BACKUP_INTERVAL > 0) {
  setInterval(async () => {
    try {
      const { backupPath, backupFileName, backupSizeMB } = await createFullBackup({ userId: null, username: 'system' });
      const { pruned } = pruneOldBackups(30);
      logActivity(null, 'system', 'auto_backup', 'system', null, 'Automated System Backup', backupPath, backupFileName, `Automated backup created (${backupSizeMB} MB). Old backups pruned: ${pruned}`);
      console.log(`Automated backup created: ${backupFileName} (${backupSizeMB} MB). Pruned: ${pruned}`);
    } catch (err) {
      console.error('Automated backup failed:', err);
    }
  }, AUTO_BACKUP_INTERVAL);
}

app.listen(PORT, () => {
  console.log(`ERP System server running on port ${PORT}`);
});