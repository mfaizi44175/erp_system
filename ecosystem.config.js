module.exports = {
  apps: [{
    name: 'erp-system',
    script: 'server.js',
    // Ensure PM2 runs from the project root so .env is found
    // Adjust this path on production to your actual deployment directory
    // e.g., '/var/www/portal/erp_system'
    cwd: process.env.PM2_CWD || '.',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Explicitly set DB_PATH and related dirs for production to avoid relying on .env loading
      // Update these to match your server paths
      DB_PATH: process.env.DB_PATH || '/var/www/portal/erp_system/erp_system.db',
      UPLOAD_DIR: process.env.UPLOAD_DIR || '/var/www/portal/erp_system/uploads',
      BACKUP_DIR: process.env.BACKUP_DIR || '/var/www/portal/erp_system/backups',
      TRUST_PROXY: process.env.TRUST_PROXY || '1',
      SESSION_SECURE: process.env.SESSION_SECURE || 'true',
      SESSION_SAME_SITE: process.env.SESSION_SAME_SITE || 'strict',
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://portal.chipmart.pk'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
