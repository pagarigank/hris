# Philippine HRIS

A multi-tenant Human Resource Information System (HRIS) designed for Philippine companies, compliant with Philippine labor laws and government regulations.

## Features

### Core Modules
- **Tenant & Identity Management** - Company onboarding, subscription/plan, users, roles, permissions
- **Employee Master (Core HR)** - 201 file equivalent, employment history, positions, org structure
- **Attendance Monitoring** - Mobile clock-in/out with GPS + geofence + selfie capture
- **Leave Monitoring** - Leave types per Philippine law, leave credits, accrual, filing/approval workflow
- **Payroll (Philippines-compliant)** - SSS, PhilHealth, Pag-IBIG, BIR withholding tax, 13th month pay
- **HR Matrix** - Org chart, headcount matrix, skills/competency matrix, performance/disciplinary matrix

### Philippine Compliance
- SSS 2024 contribution table
- PhilHealth 2024 rate (5% split equally)
- Pag-IBIG 2024 contribution
- BIR withholding tax (TRAIN Law)
- Statutory leaves (Maternity, Paternity, Solo Parent, etc.)
- 13th month pay computation

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: MSSQL Server with Row-Level Security (RLS)
- **Authentication**: JWT with refresh token rotation
- **Migration**: Custom SQL migration runner

## Project Structure

```
hris/
├── src/
│   ├── api/
│   │   ├── auth/          # Authentication endpoints
│   │   ├── employees/     # Employee CRUD
│   │   ├── attendance/    # Attendance tracking
│   │   ├── leave/         # Leave management
│   │   └── payroll/       # Payroll processing
│   ├── config/            # Configuration
│   ├── middleware/         # Auth, tenant context, permissions
│   ├── migrations/        # SQL migration files
│   └── index.ts           # Entry point
├── docs/                  # Documentation
│   ├── CHANGELOG.md
│   └── ASSUMPTIONS.md
└── package.json
```

## Setup

### Prerequisites
- Node.js 18+
- MSSQL Server 2019+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your database credentials:
   ```
   DB_SERVER=localhost
   DB_USER=sa
   DB_PASSWORD=your_password
   DB_NAME=HRIS
   ```

5. Run migrations:
   ```bash
   npm run dev
   ```

### Development

```bash
npm run dev
```

The server will start on http://localhost:3000

### API Endpoints

#### Authentication
- `POST /api/v1/auth/login` - Login with email/password
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout and revoke tokens

#### Employees
- `GET /api/v1/employees` - List employees
- `GET /api/v1/employees/:id` - Get employee by ID
- `POST /api/v1/employees` - Create employee
- `PUT /api/v1/employees/:id` - Update employee
- `DELETE /api/v1/employees/:id` - Soft delete employee

#### Attendance
- `POST /api/v1/attendance/clock-in` - Clock in with GPS
- `POST /api/v1/attendance/clock-out` - Clock out with GPS
- `GET /api/v1/attendance/logs` - Get attendance logs
- `GET /api/v1/attendance/dtr` - Get Daily Time Records

#### Leave
- `GET /api/v1/leave/types` - Get leave types
- `GET /api/v1/leave/credits` - Get leave credits
- `POST /api/v1/leave/request` - Submit leave request
- `GET /api/v1/leave/requests` - Get leave requests
- `PUT /api/v1/leave/request/:id/approve` - Approve leave
- `PUT /api/v1/leave/request/:id/reject` - Reject leave

#### Payroll
- `GET /api/v1/payroll/periods` - Get payroll periods
- `POST /api/v1/payroll/period` - Create payroll period
- `POST /api/v1/payroll/run` - Run payroll
- `GET /api/v1/payroll/runs` - Get payroll runs
- `GET /api/v1/payroll/payslips` - Get payslips

## Multi-Tenancy

The system uses a shared database with row-level security (RLS) for tenant isolation. Each tenant's data is isolated at the database level using MSSQL's built-in security policies.

## Security

- JWT authentication with short-lived access tokens (15 min)
- Refresh token rotation
- Password hashing with bcrypt
- Row-Level Security (RLS) for tenant isolation
- Tenant context set from JWT claims (never from client input)

## License

Proprietary - All rights reserved
# hris
