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
- Username: `admin`
- Password: `admin123`

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