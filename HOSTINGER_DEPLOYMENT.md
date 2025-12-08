# ERP System Deployment Guide for Hostinger

## Overview
This guide provides step-by-step instructions for deploying the ERP System on Hostinger hosting services. Hostinger offers various hosting options suitable for Node.js applications.

## Hostinger Hosting Options

### 1. VPS Hosting (Recommended)
- **Best for**: Production deployments with full control
- **Features**: Root access, custom software installation, scalable resources
- **Plans**: VPS 1, VPS 2, VPS 4, VPS 8
- **Starting Price**: ~$3.99/month

### 2. Cloud Hosting
- **Best for**: High-traffic applications with auto-scaling
- **Features**: Managed infrastructure, automatic scaling, load balancing
- **Plans**: Cloud Startup, Cloud Professional, Cloud Enterprise
- **Starting Price**: ~$9.99/month

### 3. Shared Hosting (Limited)
- **Note**: Most shared hosting plans don't support Node.js applications
- **Alternative**: Use for static file hosting only

## Pre-Deployment Checklist

### 1. Prepare Your Application
- [ ] Ensure all dependencies are listed in `package.json`
- [ ] Test application locally with `npm start`
- [ ] Create production environment variables
- [ ] Optimize database for production
- [ ] Test file upload functionality

### 2. Hostinger Account Setup
- [ ] Purchase VPS or Cloud hosting plan
- [ ] Access your hosting control panel (hPanel)
- [ ] Note your server IP address and SSH credentials
- [ ] Configure domain name (if applicable)

## VPS Deployment (Step-by-Step)

### Step 1: Connect to Your VPS

#### Using SSH (Recommended)
```bash
# Connect via SSH
ssh root@your-server-ip

# Or using provided credentials
ssh username@your-server-ip
```

#### Using Hostinger's Browser Terminal
1. Log into hPanel
2. Go to VPS → Manage
3. Click "Browser Terminal"

### Step 2: Update System and Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 for process management
sudo npm install -g pm2

# Install Git
sudo apt install git -y

# Install Nginx (optional, for reverse proxy)
sudo apt install nginx -y
```

### Step 3: Deploy Your Application

#### Option A: Upload Files via FTP/SFTP
1. **Using FileZilla or WinSCP:**
   - Host: your-server-ip
   - Protocol: SFTP
   - Port: 22
   - Username: root (or provided username)
   - Password: your-password

2. **Upload your ERP system folder to:**
   ```
   /var/www/erp-system/
   ```

#### Option B: Clone from Git Repository
```bash
# Navigate to web directory
cd /var/www/

# Clone your repository (if using Git)
git clone https://github.com/yourusername/erp-system.git

# Or create directory and upload files
sudo mkdir erp-system
cd erp-system
```

### Step 4: Configure Application

```bash
# Navigate to application directory
cd /var/www/erp-system/

# Install dependencies
npm install --production

# Create production environment file
sudo nano .env
```

#### Environment Configuration (.env)
```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DB_PATH=/var/www/erp-system/erp_system.db

# Session Configuration
SESSION_SECRET=your-super-secure-session-secret-change-this
SESSION_SECURE=false
SESSION_MAX_AGE=86400000

# File Upload Configuration
UPLOAD_PATH=/var/www/erp-system/uploads
MAX_FILE_SIZE=10485760

# Admin Configuration
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
ADMIN_EMAIL=admin@yourdomain.com

# Security Configuration
BCRYPT_ROUNDS=12
CSRF_SECRET=your-csrf-secret-key

# Backup Configuration
BACKUP_PATH=/var/www/erp-system/backups
BACKUP_RETENTION_DAYS=30

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com
```

### Step 5: Set Proper Permissions

```bash
# Set ownership
sudo chown -R www-data:www-data /var/www/erp-system/

# Set directory permissions
sudo find /var/www/erp-system/ -type d -exec chmod 755 {} \;

# Set file permissions
sudo find /var/www/erp-system/ -type f -exec chmod 644 {} \;

# Make uploads directory writable
sudo chmod -R 775 /var/www/erp-system/uploads/
sudo chmod -R 775 /var/www/erp-system/backups/

# Ensure database is writable
sudo chmod 664 /var/www/erp-system/erp_system.db
```

### Step 6: Configure PM2 Process Manager

```bash
# Start application with PM2
cd /var/www/erp-system/
pm2 start server.js --name "erp-system"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by the command above

# Check application status
pm2 status
pm2 logs erp-system
```

### Step 7: Configure Nginx Reverse Proxy (Recommended)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/erp-system
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;
    
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
        
        # File upload size limit
        client_max_body_size 50M;
    }
    
    # Serve static files directly
    location /uploads/ {
        alias /var/www/erp-system/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
```

#### Subdomain + Custom Port Example (Recommended)

Run the ERP app on an internal port (e.g., `PORT=4001`) and serve it on a subdomain such as `erp.yourdomain.com` via Nginx:

```nginx
server {
    listen 80;
    server_name erp.yourdomain.com;

    # After SSL is issued, uncomment to enforce HTTPS
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://127.0.0.1:4001; # matches PORT in .env
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    location /uploads/ {
        alias /var/www/erp-system/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
```

Update your `.env` accordingly:

```env
# Server
PORT=4001
NODE_ENV=production
TRUST_PROXY=1

# Sessions
SESSION_NAME=erp.sid
SESSION_SECRET=replace-with-strong-secret
SESSION_DIR=/var/lib/erp/sessions
SESSION_DB=sessions.sqlite
SESSION_SECURE=true
SESSION_SAME_SITE=strict # use 'none' if frontend is cross-origin

# CORS
ALLOWED_ORIGINS=https://erp.yourdomain.com
```

#### Session Security and .env Defaults Behind a Reverse Proxy

To ensure secure, persistent sessions when running behind Nginx:

- Confirm Nginx forwards `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host` headers (see config above).
- Use HTTPS so `SESSION_SECURE=true` cookies are accepted by browsers.
- In your `.env`:
  - NODE_ENV=production
  - SESSION_NAME=erp.sid
  - SESSION_SECRET=use-a-strong-32+char-string
  - SESSION_DIR=/var/lib/erp/sessions
  - SESSION_DB=sessions.sqlite
  - SESSION_SECURE=true
  - SESSION_SAME_SITE=none (if frontend is on a different domain) or lax

Notes:
- When `SESSION_SAME_SITE=none`, browsers require Secure cookies. Ensure TLS is active.
- Create and chown `SESSION_DIR` to the user that runs Node.
- The app sets `app.set('trust proxy', 1)` and `proxy: true` in express-session to honor proxy headers for Secure cookies.

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/erp-system /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx
```

### Step 8: Configure Firewall

```bash
# Install UFW (if not installed)
sudo apt install ufw -y

# Configure firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 9: SSL Certificate Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

## Cloud Hosting Deployment

### Using Hostinger Cloud Hosting

1. **Access Cloud Panel:**
   - Log into hPanel
   - Navigate to Cloud Hosting
   - Access your cloud instance

2. **Deploy via Git:**
   ```bash
   # Connect to cloud instance
   git clone https://github.com/yourusername/erp-system.git
   cd erp-system
   npm install
   ```

3. **Configure Environment:**
   - Set environment variables in cloud panel
   - Configure auto-scaling rules
   - Set up load balancer (if needed)

## Domain Configuration

### 1. Point Domain to Server

#### If domain is with Hostinger:
1. Go to hPanel → Domains
2. Click "Manage" next to your domain
3. Go to DNS Zone
4. Update A record to point to your server IP

#### If domain is elsewhere:
1. Update nameservers to Hostinger's:
   - ns1.dns-parking.com
   - ns2.dns-parking.com
2. Or update A record to your server IP

### 2. DNS Records Setup
```
Type    Name    Value               TTL
A       @       your-server-ip      3600
A       www     your-server-ip      3600
CNAME   *       yourdomain.com      3600
```

## Database Management

### 1. Database Backup Script

```bash
# Create backup script
sudo nano /var/www/erp-system/backup.sh
```

```bash
#!/bin/bash
# ERP System Backup Script

DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/www/erp-system/backups"
DB_PATH="/var/www/erp-system/erp_system.db"
UPLOADS_PATH="/var/www/erp-system/uploads"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $DB_PATH $BACKUP_DIR/erp_system_$DATE.db

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /var/www/erp-system uploads/

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
# Make script executable
sudo chmod +x /var/www/erp-system/backup.sh

# Add to crontab for daily backups
sudo crontab -e
# Add this line:
0 2 * * * /var/www/erp-system/backup.sh
```

## Monitoring and Maintenance

### 1. Application Monitoring

```bash
# Check application status
pm2 status
pm2 logs erp-system

# Monitor system resources
htop
df -h
free -m
```

### 2. Log Management

```bash
# View application logs
pm2 logs erp-system --lines 100

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# View system logs
sudo journalctl -u nginx -f
```

### 3. Performance Optimization

```bash
# Enable Nginx gzip compression
sudo nano /etc/nginx/nginx.conf

# Add in http block:
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_proxied expired no-cache no-store private must-revalidate auth;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start
```bash
# Check PM2 logs
pm2 logs erp-system

# Check if port is in use
sudo netstat -tlnp | grep :3000

# Restart application
pm2 restart erp-system
```

#### 2. File Upload Issues
```bash
# Check permissions
ls -la /var/www/erp-system/uploads/

# Fix permissions
sudo chmod -R 775 /var/www/erp-system/uploads/
sudo chown -R www-data:www-data /var/www/erp-system/uploads/
```

#### 3. Database Connection Issues
```bash
# Check database file permissions
ls -la /var/www/erp-system/erp_system.db

# Fix database permissions
sudo chmod 664 /var/www/erp-system/erp_system.db
sudo chown www-data:www-data /var/www/erp-system/erp_system.db
```

#### 4. Nginx Configuration Issues
```bash
# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check Nginx status
sudo systemctl status nginx
```

## Security Best Practices

### 1. Server Security
- Change default SSH port
- Disable root login
- Use SSH keys instead of passwords
- Keep system updated
- Configure fail2ban

### 2. Application Security
- Use strong session secrets
- Enable HTTPS
- Implement rate limiting
- Regular security updates
- Monitor access logs

### 3. Database Security
- Regular backups
- Restrict database file permissions
- Monitor database access
- Implement data retention policies

## Scaling Considerations

### Vertical Scaling (Upgrade Server)
1. Upgrade VPS plan in Hostinger panel
2. Restart services after upgrade
3. Monitor performance improvements

### Horizontal Scaling (Multiple Servers)
1. Set up load balancer
2. Use shared database server
3. Implement session store (Redis)
4. Configure file storage (NFS/S3)

## Cost Optimization

### 1. Resource Monitoring
- Monitor CPU and memory usage
- Optimize database queries
- Implement caching strategies
- Use CDN for static files

### 2. Backup Strategy
- Automated daily backups
- Off-site backup storage
- Backup retention policies
- Regular restore testing

## Support and Maintenance

### Hostinger Support
- 24/7 live chat support
- Knowledge base and tutorials
- Community forums
- Ticket system for technical issues

### Regular Maintenance Tasks
- [ ] Weekly: Check application logs
- [ ] Weekly: Monitor system resources
- [ ] Monthly: Update system packages
- [ ] Monthly: Review security logs
- [ ] Quarterly: Test backup restoration
- [ ] Quarterly: Security audit

This comprehensive guide should help you successfully deploy and maintain your ERP system on Hostinger hosting services.

## HTTPS on `portal.chipmart.pk` (Nginx)

Below is a production-ready Nginx configuration to serve your ERP app over HTTPS on `portal.chipmart.pk`, proxying to the Node app on `PORT=4001` and serving `/uploads/` directly from disk.

```nginx
# Redirect all HTTP to HTTPS
server {
    listen 80;
    server_name portal.chipmart.pk;
    return 301 https://$server_name$request_uri;
}

# Primary HTTPS server
server {
    listen 443 ssl http2;
    server_name portal.chipmart.pk;

    # TLS (Certbot paths)
    ssl_certificate /etc/letsencrypt/live/portal.chipmart.pk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.chipmart.pk/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: http: data: blob: 'unsafe-inline'" always;

    # Reverse proxy to Node app
    location / {
        proxy_pass http://127.0.0.1:4001; # matches PORT in .env
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    # Serve uploads directly
    location /uploads/ {
        alias /var/www/erp-system/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Issue/renew TLS with Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d portal.chipmart.pk
sudo certbot renew --dry-run
```

### Recommended `.env` for same-origin frontend (portal.chipmart.pk)

```env
# Server
PORT=4001
NODE_ENV=production
TRUST_PROXY=1

# Paths
DB_PATH=/var/www/erp-system/erp_system.db
UPLOAD_DIR=/var/www/erp-system/uploads
BACKUP_DIR=/var/www/erp-system/backups
AUTO_BACKUP_INTERVAL=86400000

# Sessions
SESSION_NAME=erp.sid
SESSION_SECRET=replace-with-strong-32+char-secret
SESSION_DIR=/var/lib/erp/sessions
SESSION_DB=sessions.sqlite
SESSION_SECURE=true
SESSION_SAME_SITE=strict

# Security
BCRYPT_ROUNDS=12
CSRF_ENABLED=false
REQUIRE_CORS_ORIGINS=true
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_WRITE_MAX=300

# CORS
ALLOWED_ORIGINS=https://portal.chipmart.pk
```

Notes:
- For cross-origin frontends, set `SESSION_SAME_SITE=none`, keep `SESSION_SECURE=true`, and set `CSRF_ENABLED=true`. Ensure every POST/PUT/DELETE includes `x-csrf-token`.
- Ensure `/var/lib/erp/sessions` exists and is owned by the service user running Node.
- The app already sets `app.set('trust proxy', 1)` so Secure cookies work behind Nginx.
