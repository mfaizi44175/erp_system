# ERP System - Complete Technology Stack

## Overview
This ERP System is built using modern web technologies with a focus on simplicity, reliability, and ease of deployment. The system follows a traditional client-server architecture with a Node.js backend and vanilla JavaScript frontend.

## Backend Technologies

### Core Framework & Runtime
- **Node.js**: JavaScript runtime environment for server-side execution
- **Express.js v4.18.2**: Fast, unopinionated web framework for Node.js
- **JavaScript (ES6+)**: Primary programming language

### Database
- **SQLite3 v5.1.6**: Lightweight, serverless SQL database
  - File-based database (`erp_system.db`)
  - Perfect for small to medium-scale deployments
  - Zero configuration required
  - ACID compliant transactions

### Authentication & Security
- **bcrypt v6.0.0**: Password hashing and salting
- **express-session v1.18.2**: Session management middleware
- **crypto (Node.js built-in)**: Cryptographic functionality
- **CORS v2.8.5**: Cross-Origin Resource Sharing support

### File Handling & Processing
- **multer v1.4.4**: Multipart/form-data handling for file uploads
- **fs-extra v11.1.1**: Enhanced file system operations
- **archiver v5.3.2**: File compression and archive creation
- **path (Node.js built-in)**: File path utilities

### Document Generation & Processing
- **ExcelJS v4.3.0**: Excel file generation and manipulation
- **puppeteer v19.11.1**: PDF generation and web scraping
- **nodemailer v6.9.7**: Email sending capabilities

### Development Tools
- **nodemon v3.0.1**: Development server with auto-restart

## Frontend Technologies

### Core Technologies
- **HTML5**: Semantic markup language
- **CSS3**: Styling and layout
- **Vanilla JavaScript (ES6+)**: Client-side scripting
- **Bootstrap v5.3.0**: CSS framework for responsive design

### UI Components & Icons
- **Bootstrap Components**: Modal dialogs, forms, tables, navigation
- **Font Awesome v6.4.0**: Icon library
- **Custom CSS**: Application-specific styling

### Frontend Architecture
- **Single Page Application (SPA)**: Dynamic content loading
- **Module-based UI**: Separate modules for queries, quotations, purchase orders, invoices
- **AJAX/Fetch API**: Asynchronous data communication
- **Local Storage**: Client-side data persistence

## File Structure & Organization

### Backend Structure
```
server.js                 # Main server file
package.json             # Dependencies and scripts
.env.example             # Environment variables template
```

### Frontend Structure
```
public/
├── index.html           # Main application page
├── login.html           # Authentication page
├── script.js            # Application logic
└── styles.css           # Custom styling
```

### Data Storage
```
uploads/                 # File upload storage
├── queries/             # Query attachments
├── quotations/          # Quotation files
├── purchase_orders/     # Purchase order documents
├── invoices/            # Invoice attachments
└── attachments/         # General attachments

erp_system.db           # SQLite database file
```

## Database Schema

### Core Tables
- **users**: User authentication and permissions
- **queries**: Query management and tracking
- **query_items**: Individual items within queries
- **supplier_responses**: Supplier response tracking
- **quotations**: Quotation management
- **quotation_items**: Quotation line items
- **purchase_orders**: Purchase order management
- **purchase_order_items**: Purchase order line items
- **invoices**: Invoice management
- **invoice_items**: Invoice line items

## API Architecture

### RESTful Endpoints
- **Authentication**: `/api/login`, `/api/logout`, `/api/check-auth`
- **Users**: `/api/users/*` (CRUD operations)
- **Queries**: `/api/queries/*` (Full lifecycle management)
- **Quotations**: `/api/quotations/*` (Creation and management)
- **Purchase Orders**: `/api/purchase-orders/*` (Order processing)
- **Invoices**: `/api/invoices/*` (Invoice management)
- **File Operations**: Upload, download, and management

### Data Formats
- **JSON**: Primary data exchange format
- **Multipart/form-data**: File upload handling
- **Excel**: Document generation and export
- **PDF**: Report generation

## Security Features

### Authentication & Authorization
- Session-based authentication
- Role-based access control (Admin, User)
- Permission-based module access
- Secure password hashing with bcrypt

### Data Protection
- SQL injection prevention through parameterized queries
- File upload validation and sanitization
- Session security with configurable timeouts
- CORS protection for cross-origin requests

### File Security
- Restricted file types for uploads
- Organized file storage with proper permissions
- Secure file serving through Express static middleware

## Performance Features

### Backend Optimization
- Efficient SQLite queries with proper indexing
- Streaming file uploads and downloads
- Compressed file archives for backups
- Optimized database connections

### Frontend Optimization
- CDN-hosted libraries (Bootstrap, Font Awesome)
- Minimal custom JavaScript bundle
- Efficient DOM manipulation
- Responsive design for mobile compatibility

## Deployment Technologies

### Containerization
- **Docker**: Container platform for consistent deployments
- **docker-compose**: Multi-container application orchestration
- **Node.js Alpine**: Lightweight base image

### Process Management
- **PM2**: Production process manager (recommended)
- **systemd**: System service management (Linux)
- **Windows Service**: Windows deployment option

### Web Server
- **Nginx**: Reverse proxy and static file serving (recommended)
- **Apache**: Alternative web server option
- **Built-in Express**: Direct deployment option

## Development Workflow

### Version Control
- **Git**: Source code management
- **GitHub/GitLab**: Repository hosting options

### Environment Management
- **Development**: Local development with nodemon
- **Production**: Optimized deployment configuration
- **Environment Variables**: Configurable settings

### Testing & Quality
- **Manual Testing**: Comprehensive functionality testing
- **Error Handling**: Robust error management throughout
- **Logging**: Application and error logging

## Browser Compatibility

### Supported Browsers
- **Chrome**: 90+ (Recommended)
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+
- **Mobile Browsers**: iOS Safari, Chrome Mobile

### Required Features
- ES6+ JavaScript support
- Fetch API
- CSS Grid and Flexbox
- HTML5 form validation

## System Requirements

### Server Requirements
- **Node.js**: 16.x or higher
- **RAM**: Minimum 512MB, Recommended 1GB+
- **Storage**: 1GB+ for application and data
- **OS**: Windows, Linux, macOS

### Client Requirements
- **Modern Web Browser**: Chrome, Firefox, Safari, Edge
- **JavaScript**: Enabled
- **Internet Connection**: Required for CDN resources

## Scalability Considerations

### Current Architecture
- **Single Server**: Suitable for small to medium organizations
- **SQLite Database**: Handles thousands of records efficiently
- **File Storage**: Local file system with organized structure

### Scaling Options
- **Database**: Migrate to PostgreSQL/MySQL for larger datasets
- **File Storage**: Move to cloud storage (AWS S3, Google Cloud)
- **Load Balancing**: Multiple server instances with shared database
- **Caching**: Redis for session storage and caching

## Technology Advantages

### Simplicity
- **Minimal Dependencies**: Focused technology stack
- **Easy Deployment**: Single server deployment
- **Low Maintenance**: Stable, well-established technologies

### Reliability
- **Proven Technologies**: Battle-tested frameworks and libraries
- **SQLite Reliability**: ACID compliance and data integrity
- **Error Handling**: Comprehensive error management

### Cost Effectiveness
- **Open Source**: All technologies are free and open source
- **Low Resource Usage**: Efficient resource utilization
- **Hosting Flexibility**: Deploy on various hosting platforms

## Future Technology Roadmap

### Potential Enhancements
- **TypeScript**: Type safety for larger codebases
- **React/Vue.js**: Modern frontend framework
- **PostgreSQL**: More robust database for scaling
- **Redis**: Caching and session storage
- **Docker Swarm/Kubernetes**: Container orchestration
- **CI/CD Pipeline**: Automated testing and deployment

### API Evolution
- **GraphQL**: More flexible API queries
- **WebSocket**: Real-time updates
- **Microservices**: Service-oriented architecture
- **API Gateway**: Centralized API management

This technology stack provides a solid foundation for a reliable, maintainable, and scalable ERP system suitable for small to medium-sized organizations.