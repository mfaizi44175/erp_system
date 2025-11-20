# ERP System

A comprehensive Enterprise Resource Planning (ERP) system built with Node.js, Express, and SQLite.

## Features

- **Query Management**: Create, track, and manage customer queries
- **Quotation System**: Generate and manage quotations with file attachments
- **Purchase Order Management**: Handle purchase orders and supplier communications
- **Invoice Processing**: Create and manage invoices
- **File Management**: Organized file storage with automatic categorization
- **Activity Logging**: Comprehensive audit trail of all user activities
- **Admin Dashboard**: Complete administrative interface with history tracking
- **Backup System**: Automated full system backups
- **User Authentication**: Secure login system

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

### Installation

1. Clone the repository:
```bash
git clone <your-repository-url>
cd erp-system
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the application:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

### Default Login
The system will create a default admin user on first run when the database is empty. You can control the username and password via environment variables.

- Username: `ADMIN_USERNAME` in `.env` (defaults to `admin`)
- Password: `ADMIN_PASSWORD` in `.env` (set a strong value)

Note: If users already exist in the database, changing the `.env` values does not update existing user passwords automatically.

## Development

### Project Structure

```
erp-system/
├── public/                 # Frontend files
│   ├── index.html         # Main application
│   ├── login.html         # Login page
│   ├── script.js          # Frontend JavaScript
│   └── styles.css         # Styling
├── uploads/               # File storage
│   ├── attachments/       # General attachments
│   ├── invoices/          # Invoice files
│   ├── purchase_orders/   # Purchase order files
│   ├── queries/           # Query-related files
│   └── quotations/        # Quotation files
├── server.js              # Main server file
├── erp_system.db          # SQLite database
└── package.json           # Dependencies and scripts
```

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run tests (to be implemented)

### API Testing Scripts

This repository includes helper scripts to test major API endpoints end-to-end. Before running them:

1. Run the development server (example uses port 4002):
```bash
PORT=4002 DB_PATH=./erp_system.db UPLOAD_DIR=./uploads ALLOWED_ORIGINS=http://localhost:4002 npm run dev
```

2. In a separate terminal, set credentials for testing and run the scripts. You can also set `TEST_PORT` if your server is not on 4002.

```bash
# PowerShell examples
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "AdminTest!2025"
$env:TEST_PORT = "4002"

# Authentication checks
node scripts/test_auth.js

# Quotation flow (create, get, update, export Excel)
node scripts/test_quotations.js

# Purchase orders flow (create, get, update, export Excel)
node scripts/test_purchase_orders.js

# Activity logs (admin-only, with filters)
node scripts/test_activity_logs.js

# User administration endpoints (list/get/update/password)
node scripts/test_users.js

# Query status update with supplier responses (multipart)
node scripts/test_query_status_supplier.js
```

Important: File uploads are validated by the server. Allowed file types are `.png`, `.jpg`, `.jpeg`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`. Sending other file types will result in a 500 error from Multer’s file filter.

### Database Schema

The system uses SQLite with the following main tables:
- `users` - User authentication
- `queries` - Customer queries
- `quotations` - Price quotations
- `purchase_orders` - Purchase orders
- `invoices` - Invoice records
- `activity_logs` - System activity tracking

## Deployment

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-secure-session-secret
ADMIN_PASSWORD=your-secure-admin-password
```

### Production Deployment Options

#### Option 1: Cloud Platforms (Recommended)

**Heroku:**
```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create your-erp-app

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-secret-key

# Deploy
git push heroku main
```

**Railway:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

**Render:**
1. Connect your GitHub repository
2. Set environment variables in dashboard
3. Deploy automatically

#### Option 2: VPS/Server Deployment

```bash
# On your server
git clone <your-repo>
cd erp-system
npm install --production

# Set up environment
cp .env.example .env
# Edit .env with production values

# Install PM2 for process management
npm install -g pm2

# Start application
pm2 start server.js --name "erp-system"
pm2 startup
pm2 save
```

### Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t erp-system .
docker run -p 3000:3000 -d erp-system
```

## Security Considerations

- Change default admin credentials immediately
- Use strong session secrets in production
- Enable HTTPS in production
- Regularly backup your database
- Keep dependencies updated

Recommended production `.env` values:

```
PORT=3000
NODE_ENV=production
SESSION_NAME=erp.sid
SESSION_SECRET=your-very-strong-secret
SESSION_SECURE=true           # requires HTTPS
SESSION_SAME_SITE=strict
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
DB_PATH=./erp_system.db
UPLOAD_DIR=./uploads
BACKUP_DIR=./backups
ADMIN_USERNAME=admin          # used only for initial seeding when no users exist
ADMIN_PASSWORD=change-me      # used only for initial seeding when no users exist
```

Notes:
- Set `SESSION_SECURE=true` only behind HTTPS; otherwise cookies won’t be sent by browsers.
- Keep `ALLOWED_ORIGINS` limited to your trusted origins.
- Changing `ADMIN_PASSWORD` after users exist does not alter existing accounts; use the admin UI or `scripts/reset_admin_password.js`.

### CORS configuration on VPS
- Use the `ALLOWED_ORIGINS` environment variable to list trusted origins (comma-separated). Examples:
  - `ALLOWED_ORIGINS=https://erp.yourdomain.com,https://www.yourdomain.com`
- Credentials are enabled in the server CORS config, so cookies can be sent cross-origin when origins match.
- Ensure your reverse proxy (e.g., Nginx) forwards `X-Forwarded-Proto` and `Origin` headers so secure cookies work correctly.

### Uploads directory mapping
If you serve uploads directly via Nginx, map `/uploads` to the same physical directory used by `UPLOAD_DIR`.
Example Nginx snippet:

```
location /uploads {
    alias /absolute/path/to/uploads;
    autoindex off;
    add_header Cache-Control "public, max-age=3600";
}
```

The server also serves uploads through Express at `/uploads` to match stored web paths; using an Nginx alias is optional for performance.

### Automated backups
- The admin endpoint `/api/admin/backup` creates a full backup zip into `BACKUP_DIR`.
- Optional automated backups can be enabled with `AUTO_BACKUP_INTERVAL` (milliseconds). If greater than 0, the server will:
  - Create backups on a schedule
  - Prune backups older than 30 days automatically

## Backup and Recovery

The system includes automated backup functionality:
- Full system backups (database + files)
- Manual backup via admin interface
- Backup files stored in `backups/` directory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please create an issue in the repository.

## Roadmap

### Planned Features
- [ ] Advanced reporting and analytics
- [ ] Email notifications
- [ ] Multi-user roles and permissions
- [ ] API endpoints for integrations
- [ ] Mobile-responsive improvements
- [ ] Inventory management module
- [ ] CRM functionality
- [ ] Advanced search and filtering
- [ ] Data export/import tools
- [ ] Automated testing suite

### Development Priorities
1. **User Management System** - Role-based access control
2. **Reporting Module** - Generate business reports
3. **Invoice Management** - Complete invoice lifecycle
4. **Inventory System** - Stock management
5. **CRM Integration** - Customer relationship management

## Technical Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **File Handling**: Multer
- **Authentication**: Express-session
- **Backup**: Archiver (ZIP compression)

## Performance Optimization

- Database indexing for faster queries
- File compression for backups
- Efficient file organization
- Pagination for large datasets
- Optimized frontend loading