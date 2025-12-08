# Changelog

All notable changes and testing activities for this ERP system will be documented in this file.

## [v0.4.0] - 2025-11-20

### Security
- Persistent SQLite session store initialized via `sqlite3.Database` with WAL (`concurrentDB: true`).
- Session fixation mitigated by regenerating session ID on successful login.
- Explicit cookie hardening: `httpOnly`, `rolling` enabled; `SameSite` guidance for cross-origin.
- Logout now clears client-side cookie with correct flags for full sign-out.
- Admin endpoint `/api/admin/clear-sessions` prunes expired sessions using dynamic expiry column detection.
- Reverse proxy support strengthened: app trusts proxy hops; new `.env` `TRUST_PROXY=1`.

### Docs
- `HOSTINGER_DEPLOYMENT.md`: added subdomain + custom port Nginx example (e.g., `erp.yourdomain.com` → `PORT=4001`) and session guidance behind proxies.
- `.env.example`: default `PORT=4001`, added `TRUST_PROXY=1`, clarified `ALLOWED_ORIGINS` to include ERP subdomain and `SameSite` notes.
- `.gitignore`: ignore `uploads/` and `downloads/` to prevent committing generated artifacts.

### Notes
- Use HTTPS in production with `SESSION_SECURE=true`; set `SESSION_SAME_SITE=none` only if the frontend is cross-origin.
- Ensure `SESSION_DIR` exists and is writable by the Node.js process user.

## [2025-11-20]

### Added
- New API testing scripts under `scripts/`:
  - `test_auth.js` — Login and authentication check
  - `test_quotations.js` — Create/get/update/export quotation
  - `test_purchase_orders.js` — Create/get/update/export purchase order
  - `test_activity_logs.js` — Admin activity logs with filters
  - `test_users.js` — Admin user endpoints (list/get/update/password)
  - `test_query_status_supplier.js` — Update query status with supplier responses (multipart)
- `reset_admin_password.js` — Utility to reset an admin user’s password safely using bcrypt
- `db_list_users.js` — Utility to list current users from SQLite

### Changed
- README updated with a new “API Testing Scripts” section and production `.env` recommendations
- Documentation clarified around default admin creation and how `.env` variables are used only for initial seeding when the DB is empty

### Fixed / Verified
- Resolved login issues by resetting the `admin` password to a known value; verified successful authentication and permissions
- Verified end-to-end flows:
  - Quotations: create, update, export to Excel (activity logged)
  - Purchase Orders: create, update, export to Excel (activity logged)
  - Admin activity logs: filtering by `action` and `entity_type`
  - User admin endpoints: list/get/update/password
  - Query status update with supplier responses, including file attachments
- Identified and addressed a 500 error on supplier attachments by using allowed file types per Multer’s file filter; `.pdf` works as expected

### Notes
- File uploads are restricted to: `.png`, `.jpg`, `.jpeg`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`
- Ensure `SESSION_SECURE=true` only when serving over HTTPS; otherwise cookies may not be sent
- Changing `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env` does not update existing users; use admin endpoints or `scripts/reset_admin_password.js`
