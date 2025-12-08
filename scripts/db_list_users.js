// Simple script to list users from the SQLite DB
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'erp_system.db');

const db = new sqlite3.Database(dbPath);
db.all('SELECT id, username, full_name, role, is_active FROM users ORDER BY id', (err, rows) => {
  if (err) {
    console.error('Error reading users:', err.message);
    process.exitCode = 1;
  } else {
    console.log('Users:');
    rows.forEach(r => {
      console.log(`- id=${r.id} username=${r.username} role=${r.role} active=${r.is_active} full_name=${r.full_name}`);
    });
  }
  db.close();
});