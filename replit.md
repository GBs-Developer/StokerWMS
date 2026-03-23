# Stokar WMS - Warehouse Management System

## Overview

Stokar WMS is a warehouse management system designed for logistics operations in Brazil (Portuguese UI). The application handles order picking (separação), verification (conferência), counter service (balcão) workflows, plus new WMS modules: addressing, pallet receiving, check-in/allocation, transfer, and counting cycles. It features multi-company support (companies 1 and 3), role-based access control with distinct interfaces for supervisors and operators, real-time work unit locking, and barcode scanning integration for mobile collector devices.

The system uses SQLite (libsql) as the operational database, supporting ERP synchronization via a staging layer concept. Work units represent atomic tasks that can be locked, tracked through state machines, and audited for accountability.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state with controlled caching per session
- **UI Components**: shadcn/ui (Radix primitives) with Tailwind CSS and CSS custom properties for theming
- **Form Handling**: React Hook Form with Zod validation
- **Date Utilities**: date-fns

The frontend is organized with pages under `client/src/pages/` grouped by function:
- **Auth pages**: `login.tsx`, `company-select.tsx`, `home.tsx`
- **WMS / Operação modules**: `wms/recebimento.tsx`, `wms/checkin.tsx` (Endereçamento), `wms/transferencia.tsx`, `wms/contagem.tsx`, `wms/enderecos.tsx`
- **Logística modules**: `fila-pedidos/`, `supervisor/orders.tsx`, `supervisor/routes.tsx`, `supervisor/route-orders.tsx` (Expedição), `supervisor/exceptions.tsx`
- **Administração modules**: `supervisor/users.tsx`, `supervisor/manual-qty-rules.tsx`, `supervisor/mapping-studio.tsx`, `supervisor/reports.tsx`, `supervisor/audit.tsx`, `admin/permissoes.tsx`
- **Legacy operator modules**: `separacao/`, `conferencia/`, `balcao/`, `handheld/`

Home page (`home.tsx`) organizes modules into three collapsible sections: Operação, Logística, Administração. Module visibility is controlled by role-based defaults or per-user `allowedModules` overrides set in the Permissões de Acesso page.

Reusable UI components are in `client/src/components/ui/` following shadcn conventions.

### Backend Architecture
- **Runtime**: Node.js with Express (ESM modules)
- **Language**: TypeScript
- **Database ORM**: Drizzle ORM with SQLite (libsql)
- **Authentication**: JWT tokens stored in HttpOnly cookies with bcrypt password hashing
- **Session Management**: Custom session table with tokens, session keys, company context, and expiration

Routes are registered in `server/routes.ts` (legacy + auth) and `server/wms-routes.ts` (WMS modules). The storage layer (`server/storage.ts`) implements an `IStorage` interface that abstracts all database operations.

### Authentication and Authorization
- Role-based access control with roles: `administrador`, `supervisor`, `separacao`, `conferencia`, `balcao`, `fila_pedidos`, `recebedor`, `empilhador`, `conferente_wms`
- Multi-company support: login → company selection (if user has access to multiple companies) → home
- Middleware functions: `isAuthenticated`, `requireRole`, `requireCompany` protect routes
- Backend WMS routes enforce both company context and role checks on all endpoints
- Sessions include a unique session key for cache invalidation on logout
- 24-hour token expiry with cookie-based storage
- 2-hour inactivity timeout on frontend

### Multi-Company Architecture
- Companies: ID 1 ("Empresa 1"), ID 3 ("Empresa 3")
- `companyId` flows from login → session → all WMS requests via `requireCompany` middleware
- All WMS data (addresses, pallets, movements, counting cycles) is scoped by company
- Company selection page shown after login when user has access to multiple companies
- `getCompanyLabel()` utility maps company IDs to display names

### Work Unit and Locking System (Legacy)
- Work units represent atomic tasks derived from orders
- Lock mechanism with TTL (15 minutes default) prevents concurrent operations
- Heartbeat system extends locks for active sessions
- Force unlock capability for supervisors
- State machine: `pendente` → `em_andamento` → `concluido` (with `recontagem` and `excecao` branches)

### WMS Modules

#### Addressing (Endereços)
- Address code format: `{bairro}-{rua}-{bloco}-{nivel}`
- Types: standard, picking, recebimento, expedicao
- Active/inactive toggle, bulk import support
- Supervisor-only management

#### Pallet Receiving (Recebimento)
- NF (nota fiscal) search and association
- Add items by barcode with lot/expiry tracking
- Auto-generated pallet codes: `PLT-{companyId}-{timestamp}`
- Creates movement audit trail on creation

#### Check-in/Allocation
- Scan pallet → select available address → allocate
- Rule: 1 pallet per address max
- Address must belong to same company
- Forklift operator or supervisor access

#### Transfer
- Scan pallet → select destination address → transfer
- Validates destination is empty and same company
- Supervisor can cancel pallets with reason
- Full movement audit trail

#### Counting Cycles (Contagem)
- Types: por_endereco, por_produto
- Blind count: expectedQty hidden from operators (supervisor can reveal)
- State machine: pendente → em_andamento → concluido → aprovado/rejeitado
- Approval updates product_company_stock with counted quantities
- Divergence percentage calculated automatically

### Database Schema
Tables defined in `shared/schema.ts`:

**Legacy tables:**
- `users` - User accounts with roles, sections, company access
- `orders` - Orders synced from ERP with status tracking
- `orderItems` - Line items with separation/verification status
- `products` - Product catalog with barcodes and pickup locations
- `routes` - Delivery routes for order grouping
- `workUnits` - Atomic work tasks with locking fields
- `exceptions` - Exception records
- `auditLogs` - Operation audit trail
- `sessions` - Authentication sessions (with companyId)

**WMS tables:**
- `wmsAddresses` - Warehouse addresses with bairro/rua/bloco/nivel grid
- `pallets` - Pallet tracking with status and address assignment
- `palletItems` - Items on each pallet with lot/expiry/FEFO
- `palletMovements` - Full movement audit trail
- `nfCache` - Cached NF data from ERP sync
- `nfItems` - NF line items
- `countingCycles` - Counting cycle headers with approval workflow
- `countingCycleItems` - Individual count items with divergence tracking
- `productCompanyStock` - Per-company stock quantities

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: esbuild bundles the server, Vite builds the client to `dist/public`
- Custom build script in `script/build.ts` handles both frontend and backend bundling

## External Dependencies

### Database
- **SQLite (libsql)**: Primary operational database
- Connection via `SQLITE_URL` environment variable
- Auto-migrations in `server/db.ts` (safe to run multiple times)

### Key npm Packages
- `drizzle-orm` / `@libsql/client` - Database ORM with SQLite
- `bcrypt` - Password hashing
- `cookie-parser` - Cookie handling for auth tokens
- `zod` - Schema validation for API payloads
- `@tanstack/react-query` - Server state management
- Full Radix UI primitive suite via shadcn/ui components

### Real-Time Updates (SSE)
- Server-Sent Events via `/api/sse` endpoint
- Event types include picking, conference, exception, lock, work unit, and pallet events
- WMS events: `pallet_created`, `pallet_allocated`, `pallet_transferred`, `pallet_cancelled`
