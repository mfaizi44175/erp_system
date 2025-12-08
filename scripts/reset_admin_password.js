// Reset the admin user's password to a known value from env
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'erp_system.db');
const username = process.env.RESET_USERNAME || process.env.ADMIN_USERNAME || 'admin';
const newPassword = process.env.RESET_PASSWORD || process.env.ADMIN_PASSWORD || 'AdminTest!2025';
const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

const db = new sqlite3.Database(dbPath);

db.get('SELECT id, username, is_active FROM users WHERE username = ?', [username], (err, user) => {
  if (err) {
    console.error('Error reading user:', err.message);
    process.exitCode = 1;
    db.close();
    return;
  }
  if (!user) {
    console.error('User not found:', username);
    process.exitCode = 1;
    db.close();
    return;
  }
  const hash = bcrypt.hashSync(newPassword, rounds);
  db.run('UPDATE users SET password = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, user.id], (uerr) => {
    if (uerr) {
      console.error('Error updating password:', uerr.message);
      process.exitCode = 1;
    } else {
      console.log(`Password updated for user ${username}. is_active set to 1.`);
    }
    db.close();
  });
});