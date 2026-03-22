# GLA WMS - Warehouse Management System

## Overview

GLA WMS is a warehouse management system designed for logistics operations in Brazil. The application handles order picking (separação), verification (conferência), and counter service (balcão) workflows. It features role-based access control with distinct interfaces for supervisors and operators, real-time work unit locking to prevent concurrent operations on the same orders, and barcode scanning integration for mobile collector devices.

The system follows a dual-database architecture pattern with PostgreSQL as the operational database, supporting ERP synchronization via a staging layer concept. Work units represent atomic tasks that can be locked, tracked through state machines, and audited for accountability.

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

The frontend is organized with pages under `client/src/pages/` grouped by role (supervisor, separacao, conferencia, balcao). Reusable UI components are in `client/src/components/ui/` following shadcn conventions. Custom application components include scan input for barcode readers, status badges, action tiles, and gradient headers.

### Backend Architecture
- **Runtime**: Node.js with Express (ESM modules)
- **Language**: TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: JWT tokens stored in HttpOnly cookies with bcrypt password hashing
- **Session Management**: Custom session table with tokens, session keys, and expiration

Routes are registered in `server/routes.ts` and follow RESTful patterns under `/api/*`. The storage layer (`server/storage.ts`) implements an `IStorage` interface that abstracts all database operations, separating business logic from data access.

### Authentication and Authorization
- Role-based access control with four roles: `supervisor`, `separacao`, `conferencia`, `balcao`
- Middleware functions `isAuthenticated`, `requireRole` protect routes
- Sessions include a unique session key for cache invalidation on logout
- 24-hour token expiry with cookie-based storage

### Work Unit and Locking System
- Work units represent atomic tasks derived from orders
- Lock mechanism with TTL (15 minutes default) prevents concurrent operations
- Heartbeat system extends locks for active sessions
- Force unlock capability for supervisors
- State machine for work units: `pendente` → `em_andamento` → `concluido` (with `recontagem` and `excecao` branches)

### Database Schema
Tables defined in `shared/schema.ts`:
- `users` - User accounts with roles and section assignments
- `orders` - Orders synced from ERP with status tracking
- `orderItems` - Line items with separation/verification status
- `products` - Product catalog with barcodes and pickup locations
- `routes` - Delivery routes for order grouping
- `workUnits` - Atomic work tasks with locking fields
- `exceptions` - Exception records (not found, damaged, expired)
- `auditLogs` - Operation audit trail
- `sessions` - Authentication sessions

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: esbuild bundles the server, Vite builds the client to `dist/public`
- Custom build script in `script/build.ts` handles both frontend and backend bundling

## External Dependencies

### Database
- **PostgreSQL**: Primary operational database
- Connection via `DATABASE_URL` environment variable
- Drizzle Kit for migrations (`drizzle-kit push`)
- Connection pooling with `pg` package

### Third-Party Services
- No external API integrations currently implemented
- Architecture supports ERP synchronization via staging database pattern (sync logic to be implemented)

### Key npm Packages
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `bcrypt` - Password hashing
- `cookie-parser` - Cookie handling for auth tokens
- `zod` - Schema validation for API payloads
- `@tanstack/react-query` - Server state management
- Full Radix UI primitive suite via shadcn/ui components

### Real-Time Updates (SSE)
- Server-Sent Events via `/api/sse` endpoint
- Event types: `picking_started`, `item_picked`, `picking_finished`, `conference_started`, `conference_finished`, `exception_created`, `lock_acquired`, `lock_released`, `work_unit_created`, `picking_update`
- Supervisor Orders page subscribes to all events for instant updates
- Conference page subscribes to all events for work unit availability updates
- Separation page uses polling (refetchInterval: 1000ms) for real-time data

### Development Tools
- `@replit/vite-plugin-runtime-error-modal` - Runtime error display
- `@replit/vite-plugin-cartographer` - Development navigation (Replit-specific)

## Recent Changes

### February 8, 2026
- Migrated database from SQLite (better-sqlite3) to PostgreSQL using pg driver and Drizzle ORM
- Schema updated: sqliteTable to pgTable, real to doublePrecision, JSON columns now use jsonb, boolean uses native pg boolean, serial for auto-increment IDs
- Supervisor Orders page: standardized period filter (De/Ate + Buscar button), removed pendente_conferencia and finalizado from status filter, updated table header to Status Sep./Conf.
- Enhanced SSE broadcasting: added picking_started, item_picked, picking_finished, conference_started, conference_finished, exception_created events across backend routes
- Conference page: enhanced SSE subscriptions for real-time work unit updates, scan-pallet now updates order status to em_conferencia
- Fixed Windows line endings (CRLF to LF) across all TypeScript files
- Added `referenceCode` (text) field to products table for CODIGOINTERNOFORN reference codes
- Added `boxBarcode` seed data for products (some with DUN barcodes, some null)
- Complete separation module UI/UX overhaul for handheld/collector devices:
  - Compact header (minimal, no gradient) to maximize screen space
  - Period filter with "Buscar" button (same pattern as supervisor orders)
  - Simplified order list: order number, client, qty items (section-filtered), date
  - Removed cart scan step - goes directly from select to picking
  - Two-tab bottom navigation: Product detail (Package icon) + Product list (List icon)
  - Product tab shows: order codes, erpCode, referenceCode, barcode, boxBarcode (or "Indisponivel"), qty with + button
  - List tab shows: all products with code/barcode/qty/orders, section filter, green checkmarks, exception indicators
  - Barcode scan always navigates to Product tab
  - Session persistence via localStorage (auto-resume on reconnect)
  - Completion returns to initial order list (not cart/complete screen)
  - SSE real-time updates for all picking events