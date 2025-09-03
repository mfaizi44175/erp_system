# ERP System Deployment Guide

This guide provides step-by-step instructions for deploying the ERP system to production.

## Pre-Deployment Checklist

- [ ] Change default admin credentials
- [ ] Set strong session secret
- [ ] Configure environment variables
- [ ] Test all functionality locally
- [ ] Backup existing data (if upgrading)
- [ ] Review security settings

## Quick Deployment Options

### 1. Heroku (Recommended for beginners)

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create new app
heroku create your-erp-system-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=$(openssl rand -base64 32)
heroku config:set ADMIN_PASSWORD=your-secure-password

# Deploy
git push heroku main

# Open your app
heroku open
```

### 2. Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Set environment variables
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=$(openssl rand -base64 32)
railway variables set ADMIN_PASSWORD=your-secure-password

# Deploy
railway up
```

### 3. Render

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set environment variables in the dashboard:
   - `NODE_ENV=production`
   - `SESSION_SECRET=your-secure-secret`
   - `ADMIN_PASSWORD=your-secure-password`
4. Deploy automatically

### 4. DigitalOcean App Platform

1. Connect your GitHub repository
2. Configure the app:
   - Runtime: Node.js
   - Build Command: `npm install`
   - Run Command: `npm start`
3. Set environment variables
4. Deploy

## VPS/Server Deployment

### Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Node.js 16+ installed
- PM2 for process management
- Nginx for reverse proxy (optional)
- SSL certificate (recommended)

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx (optional)
sudo apt install nginx -y
```

### Step 2: Deploy Application

```bash
# Clone repository
git clone https://github.com/yourusername/erp-system.git
cd erp-system

# Install dependencies
npm install --production

# Set up environment
cp .env.example .env
nano .env  # Edit with your configuration

# Start with PM2
pm2 start server.js --name "erp-system"
pm2 startup
pm2 save
```

### Step 3: Configure Nginx (Optional)

Create `/etc/nginx/sites-available/erp-system`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/erp-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: SSL Certificate (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Docker Deployment

### Using Docker Compose

```bash
# Clone repository
git clone https://github.com/yourusername/erp-system.git
cd erp-system

# Set environment variables
cp .env.example .env
# Edit .env with your configuration

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f
```

### Using Docker only

```bash
# Build image
docker build -t erp-system .

# Run container
docker run -d \
  --name erp-system \
  -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/backups:/app/backups \
  -v $(pwd)/erp_system.db:/app/erp_system.db \
  -e NODE_ENV=production \
  -e SESSION_SECRET=your-secure-secret \
  erp-system
```

## Environment Variables

### Required Variables

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-super-secure-session-secret
ADMIN_PASSWORD=your-secure-admin-password
```

### Optional Variables

```env
DB_PATH=./erp_system.db
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
BCRYPT_ROUNDS=12
BACKUP_DIR=./backups
AUTO_BACKUP_INTERVAL=86400000
ALLOWED_ORIGINS=https://yourdomain.com
```

## Security Checklist

- [ ] Change default admin credentials
- [ ] Use strong, unique session secret
- [ ] Enable HTTPS in production
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Monitor application logs
- [ ] Set up automated backups
- [ ] Configure CORS properly
- [ ] Use environment variables for secrets
- [ ] Regular database backups

## Monitoring and Maintenance

### Health Checks

```bash
# Check application status
pm2 status

# View logs
pm2 logs erp-system

# Restart application
pm2 restart erp-system

# Monitor resources
pm2 monit
```

### Backup Strategy

1. **Automated Backups**: The system includes built-in backup functionality
2. **Manual Backups**: Use the admin interface to create manual backups
3. **External Backups**: Set up external backup solutions for critical data

```bash
# Manual backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf "backup_$DATE.tar.gz" erp_system.db uploads/
```

### Updates and Maintenance

```bash
# Update application
git pull origin main
npm install --production
pm2 restart erp-system

# Update dependencies
npm update
npm audit fix
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   sudo lsof -i :3000
   sudo kill -9 <PID>
   ```

2. **Permission errors**
   ```bash
   sudo chown -R $USER:$USER /path/to/erp-system
   chmod -R 755 /path/to/erp-system
   ```

3. **Database locked**
   ```bash
   pm2 restart erp-system
   ```

4. **File upload issues**
   ```bash
   mkdir -p uploads/{attachments,invoices,purchase_orders,queries,quotations}
   chmod -R 755 uploads/
   ```

### Log Locations

- Application logs: `pm2 logs erp-system`
- Nginx logs: `/var/log/nginx/`
- System logs: `/var/log/syslog`

## Performance Optimization

### Database Optimization

```sql
-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
```

### File System Optimization

- Use SSD storage for better I/O performance
- Regular cleanup of old backup files
- Monitor disk usage

### Application Optimization

- Enable gzip compression in Nginx
- Use CDN for static assets (if needed)
- Monitor memory usage with PM2

## Support and Maintenance

- Monitor application health regularly
- Keep dependencies updated
- Regular security audits
- Backup verification
- Performance monitoring

For additional support, refer to the main README.md file or create an issue in the repository.