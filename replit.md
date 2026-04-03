# Stoker WMS - Warehouse Management System

## Overview

Stoker WMS is a warehouse management system designed for logistics operations in Brazil (Portuguese UI). The application handles order picking (separação), verification (conferência), counter service (balcão) workflows, plus new WMS modules: addressing, pallet receiving, check-in/allocation, transfer, and counting cycles. It features multi-company support (companies 1 and 3), role-based access control with distinct interfaces for supervisors and operators, real-time work unit locking, and barcode scanning integration for mobile collector devices.

The system uses SQLite (libsql) as the operational database, supporting ERP synchronization via a staging layer concept. Work units represent atomic tasks that can be locked, tracked through state machines, and audited for accountability.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state with controlled caching per session
- **UI Components**: shadcn/ui (Radix primitives) with Tailwind CSS and CSS custom properties for theming
- **Design System**: Premium mobile-first UI with Inter font (Google Fonts), glassmorphism effects, `rounded-2xl` cards, `rounded-xl` inputs/buttons, subtle animations (fade-in, slide-up, scale-in)
- **Layout Pattern**: `max-w-lg mx-auto px-4 py-4 space-y-3 safe-bottom` for WMS operational pages
- **Header**: `GradientHeader` component with dark gradient (`hsl(222,47%,14%)` → `hsl(199,89%,30%)`) + radial overlays, `compact` prop
- **Cards**: `rounded-2xl border border-border/50 bg-card` with `divide-y divide-border/30` item lists
- **CTA Buttons**: `h-14 rounded-xl font-semibold shadow-lg shadow-primary/15 active:scale-[0.98]`
- **Status Badges**: Named `statusStyles` Record with light/dark border+text+bg Tailwind classes per status
- **Form Handling**: React Hook Form with Zod validation
- **Date Utilities**: date-fns

The frontend is organized with pages under `client/src/pages/` grouped by function:
- **Auth pages**: `login.tsx`, `company-select.tsx`, `home.tsx`
- **WMS / Operação modules**: `wms/recebimento.tsx`, `wms/checkin.tsx` (Endereçamento), `wms/transferencia.tsx`, `wms/contagem.tsx`, `wms/enderecos.tsx`, `wms/produtos.tsx`
- **Logística modules**: `fila-pedidos/`, `supervisor/orders.tsx`, `supervisor/routes.tsx`, `supervisor/route-orders.tsx` (Expedição), `supervisor/exceptions.tsx`
- **Administração modules**: `supervisor/users.tsx`, `supervisor/manual-qty-rules.tsx`, `supervisor/mapping-studio.tsx`, `supervisor/reports.tsx`, `supervisor/audit.tsx`, `admin/permissoes.tsx`, `admin/kpi-dashboard.tsx` (KPIs de Operadores — desempenho por operador com ranking, tempo médio, exceções, volumes)
- **WMS Report pages** (under `supervisor/reports/`): `counting-cycles.tsx` (contagem), `wms-addresses.tsx` (endereços), `pallet-movements.tsx` (movimentações), `stock-discrepancy.tsx` (divergências de estoque) — accessible from the Reports hub with filters, summary stats, expandable details, and print support
- **Legacy operator modules**: `separacao/`, `conferencia/`, `balcao/`, `handheld/`

Home page (`home.tsx`) organizes modules into three collapsible sections: Operação, Logística, Administração. Module visibility is controlled by role-based defaults or per-user `allowedModules` overrides set in the Permissões de Acesso page. Legacy standalone modules (separação, conferência, balcão) are shown based on role OR `allowedModules` inclusion.

### Stock Info Components
- **ProductStockInfo** (`client/src/components/wms/product-stock-info.tsx`): Shows Real stock, PALETT (palletized units), PICK (gondola/picking units), and discrepancy indicator. Has `compact` prop for inline display.
- **StockLegend**: Displays once per section explaining PALETT and PICK meanings. Used in recebimento, checkin, transferência, produtos, and stock discrepancy report.
- **useProductStockBatch** hook (`client/src/hooks/use-product-stock.ts`): Batch fetches stock info for multiple product IDs via `/api/products/stock-batch`.

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
- 12-hour token expiry with cookie-based storage; `getSessionByToken` in storage enforces `expiresAt > now`
- 2-hour inactivity timeout on frontend
- **Badge code**: generated as `randomBytes(16).toString("hex")` — random, opaque, independent of password. NOT regenerated on password change; use the badge reset endpoint to rotate.
- **Auto-logout**: Any 401 from any query/mutation fires a `stoker:unauthorized` CustomEvent; `AuthProvider` listens and calls `logout()` immediately
- **Print config cache**: cleared (`invalidatePrintConfigCache`) on every logout/session clear to prevent user-A's config leaking to user-B on the same tab
- **ErrorBoundary**: global class component wraps the entire App, shows a friendly error screen + reload button on any uncaught React render error

### Print Agent Architecture
- **Agent** (`print-agent/agent.py`): Python process running on Windows machines with printers. Connects outbound to the server via WebSocket.
- **PDF generation**: ReportLab (native, no browser) for structured templates (`volume_label`, `pallet_label`). xhtml2pdf as fallback for legacy HTML jobs.
- **Protocol**: Frontend sends `template` + `data` (JSON) to `/api/print/job` → server routes to agent via WS → agent renders PDF with ReportLab → prints via SumatraPDF.
- **Dependencies**: `pip install websocket-client reportlab xhtml2pdf` (see `print-agent/requirements.txt`)
- **Two print paths in the app**:
  1. `window.open()` + `window.print()` — supervisor reports (orders, exceptions, routes). Browser-native, no agent needed.
  2. `usePrint` hook → `/api/print/job` → agent — labels (volume, pallet). Uses ReportLab templates.
- **usePrint hook** (`client/src/hooks/use-print.ts`): Fire-and-forget with 5s cooldown. Accepts `print(null, printType, { template, data })` for ReportLab or `print(html, printType)` for legacy HTML.

### Multi-Company Architecture
- Companies: ID 1 ("Empresa 1"), ID 3 ("Empresa 3")
- `companyId` flows from login → session → all requests via `requireCompany` middleware
- **All routes** (WMS and legacy) enforce company context via `requireCompany`
- Company-specific pickup point rules centralized in `server/company-config.ts`:
  - **Operations**: Company 1 → [4, 58], Company 3 → [60, 61]
  - **Reports**: Company 1 → [1, 2, 4, 58], Company 3 → [52, 54, 60, 61]
  - **Balcão**: Company 1 → [1, 2], Company 3 → [52, 54]
- SSE connections require authentication and store `companyId`; all SSE broadcasts are company-scoped
- Company selection page shown after login when user has access to multiple companies
- `getCompanyLabel()` utility maps company IDs to display names
- `authorizeWorkUnit()` and `authorizeOrder()` helper functions enforce company and section access on all work-unit and order endpoints

### Work Unit and Locking System
- **Separation**: Work units are created per section+pickup_point; items are filtered by the work unit's section
- **Conference**: ONE work unit per order, created automatically when separation completes
- Separação users only see work units matching their assigned sections (regardless of separation mode); users with no sections see nothing
- Orders' `pickup_points` field aggregates ALL unique pickup points from order items (not just the first one)
- Lock mechanism with TTL (15 minutes default) prevents concurrent operations at the order level
- **Atomic locking**: `lockWorkUnits` uses a database transaction with WHERE guard (`lockedBy IS NULL OR same user OR expired`); if any requested unit is already locked by another operator, the entire transaction rolls back (no partial locks)
- Heartbeat system extends locks for active sessions
- Force unlock capability for supervisors
- State machine: `pendente` → `em_andamento` → `concluido` (with `recontagem` and `excecao` branches)

### Concurrency & Data Integrity
- **Lock ownership enforcement**: `assertLockOwnership()` function verifies that the requesting user is the lock owner before allowing scan-item, check-item, balcao-item, batch-sync, complete, complete-balcao, and complete-conference operations. Supervisors/admins bypass this check.
- **Terminal state guard**: Completion endpoints (complete, complete-balcao, complete-conference) return idempotent success if work unit is already `concluido`, preventing duplicate audit logs and SSE broadcasts
- **Atomic quantity increments with DB-level cap**: All scan endpoints (scan-item, check-item, balcao-item) and batch-sync use SQL-level `LEAST(COALESCE(field, 0) + delta, quantity - COALESCE(exceptionQty, 0))` atomic increments via `atomicIncrementSeparatedQty`/`atomicIncrementCheckedQty` — prevents both race conditions and over-target quantities at the DB level
- **Duplicate product handling**: All scan endpoints use `filter()` + smart selection (pick item with lowest progress toward target) instead of `find()`, correctly handling orders with the same product on multiple lines
- **Batch sync exception validation**: Exception quantity validated against item total within the transaction; negative/zero quantities skipped
- **Completion checks** (`checkAndCompleteWorkUnit`, `checkAndCompleteConference`): Wrapped in database transactions to ensure atomic read-verify-update
- **Order status transition** (`checkAndUpdateOrderStatus`): Fully transactional — all reads (work units, existing conference check) and writes (status update, conference WU creation) happen within a single `db.transaction()`. Guards against cancelled/finalizado orders to prevent status resurrection
- **Status transition guards**: `complete-balcao` and `complete-conference` both verify order isn't `cancelado` before updating status. Prevents resurrecting cancelled orders
- **Exception deletion** (`deleteExceptionWithRollback`): Single transaction wraps exception delete + item qty reset + WU status reset + order status downgrade, preventing partial state on failure
- **Exception adjustments** (`adjustItemQuantityForException`): Wrapped in transactions
- **Progress resets** (`resetWorkUnitProgress`, `resetConferenciaProgress`): Wrapped in transactions
- **Stale response protection**: All three critical modules (separação, conferência, balcão) use `activeSessionTokenRef` to discard in-flight API responses if the operator switched orders/context while awaiting
- **Queue draining on finalize/cancel**: All three modules clear `scanQueueRef` and `incrementQueueRef` on cancel AND finalize, preventing orphaned API calls from leaking into the next session
- **Delta store safety**: Pending delta store is cleared AFTER successful API completion (not before), preventing data loss on network failure. Cancel handlers clear it immediately since no persistence is needed
- **Full state cleanup on cancel**: All three modules clear queues, delta stores, selectedAddresses, and reset currentProductIndex on cancel — prevents state contamination between orders
- **reset-item-check WU status**: Resetting checked items also sets work unit status back to `em_andamento` within the same transaction, preventing inconsistent state where items are reset but WU remains `concluido`
- **Relaunch company scoping**: `/api/orders/relaunch` now validates order belongs to requesting company before relaunching
- **Picking session cleanup**: `unlock` endpoint deletes picking sessions by `orderId`+`sectionId` (no `workUnitId` column exists); `relaunchOrder` deletes by `orderId`
- **No scan retry on failure**: Scan queue no longer retries failed requests automatically — this prevents double-increment when the first request succeeded but the response was lost. On failure, pending deltas are cleared and the UI refreshes from server state
- **Romaneio pickup_point filter**: When specific `orderIds` are selected, item-level `pickup_point` filtering is skipped since order-level selection already scopes correctly
- **Exception authorization scoping**: `authorizeExceptions` accepts optional `companyId` and validates exception ownership via JOIN to `workUnits.companyId`; also blocks re-authorization of already-authorized exceptions
- **Failed login auditing**: Failed login attempts logged with IP/UserAgent for security monitoring

### Database Indexes
Critical indexes added for query performance:
- `idx_order_items_order_id`, `idx_order_items_product_id` — order item lookups
- `idx_work_units_order_id`, `idx_work_units_locked_by`, `idx_work_units_company_status` — work unit queries
- `idx_picking_sessions_order_section` — session lookups
- `idx_exceptions_work_unit_id`, `idx_exceptions_order_item_id` — exception queries
- `idx_audit_logs_entity`, `idx_audit_logs_user_id` — audit log queries

### WMS Modules

#### Addressing (Endereços)
- Address code format: `{bairro}-{rua}-{bloco}-{nivel}`
- Types: standard, picking, recebimento, expedicao
- Active/inactive toggle, bulk import support
- Supervisor-only management
- **Dashboard stats**: total/active/occupied/empty/inactive counts
- **Filters**: by type (standard/picking/etc) and status (active/inactive/occupied/empty)
- **Occupancy display**: shows which pallet occupies each address via `/api/wms-addresses/with-occupancy` endpoint
- **Search**: by address code or pallet code
- **Delete confirmation**: dialog-based with safeguard against deleting occupied addresses

#### Product Search (Produtos)
- Search by name, ERP code, or barcode with debounced input
- **Search types**: All, Code only, Description only (tab selector)
- **Batch-optimized queries**: stock, address allocation, and last movement data loaded in batch (no N+1)
- **Rich results**: total stock, picking stock, address count, address list with quantities
- **Warning badges**: "Sem endereço" for products with stock but no WMS address
- **Last movement date**: shows most recent pallet movement per product
- **Smart sorting**: exact ERP code match first, then stocked products, then alphabetical
- Clear search button, Enter key submit

#### Pallet Receiving (Recebimento)
- NF (nota fiscal) search and association
- Add items by barcode with lot/expiry tracking
- Auto-generated pallet codes: `PLT-{companyId}-{timestamp}`
- Creates movement audit trail on creation
- **Progress indicator** when importing items from NF
- **Direct quantity editing**: click quantity to type exact value
- **Confirmation dialog** before creating pallet (prevents double-click)
- Item summary shown in confirmation

#### Check-in/Allocation
- Scan pallet → select address → allocate or merge
- **Smart allocation**: if destination address is empty → normal allocation; if occupied → products are transferred/merged into the existing pallet (matching by product+lot+expiry), incoming pallet is cancelled
- **Merge UI**: AddressPicker shows all addresses (not just empty); amber warning when address is occupied with occupant pallet code; confirmation dialog explains merge behavior; button changes to "Transferir Produtos"
- **Occupancy detection**: uses targeted `/api/pallets/by-address/:id` query (not full pallet list) for reliable, lightweight detection
- Address must belong to same company
- Forklift operator or supervisor access
- **Item details**: shows products with ERP code, quantity, lot info
- **Timestamps**: created date shown on pending pallets
- **Filter/search**: for large pending pallet lists
- **Cancel dialog**: confirmation required before canceling a pallet

#### Transfer
- Scan pallet → select destination address → transfer
- **Validation**: only `alocado` pallets can transfer; `sem_endereco` blocked with guidance message
- **Validation**: destination must be active, empty, and different from current address
- **Confirmation dialog** before executing transfer
- **Pallet detail view**: shows items with product info, quantities, lots
- **Movement history**: shows recent movements for selected pallet
- Supervisor can cancel pallets with reason (minimum 3 characters enforced)
- **Filter/search**: for pallet list by code or address
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

### ERP Synchronization (DB2)
- `sync_db2.py` syncs data from IBM DB2 ERP to local SQLite every 10 minutes
- SQL queries stored in `sql/` directory: `orcamentos.sql`, `enderecos_wms.sql`, `notas_recebimento.sql`
- Sync functions: `sync_orcamentos` (orders), `sync_box_barcodes` (product barcodes), `sync_enderecos_wms` (warehouse addresses), `sync_notas_recebimento` (purchase NFs)
- All ERP data respects company parameter (IDEMPRESA IN (1, 3))
- Addresses are inserted only if they don't already exist (checked by company_id + code)
- NFs are grouped by company + nfNumber + series, items linked to local products when possible

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
- All SSE broadcasts include `companyId` parameter for tenant isolation

### WebSocket Scanning (`/ws/scanning`)
- **Server**: `server/ws-scanning.ts` — handles `scan` (separação/balcão → `atomicScanSeparatedQty`) and `check` (conferência → `atomicScanCheckedQty`) messages
- **Auth**: cookie `authToken` or query param `token`; validates lock ownership and company access per message
- **Protocol**: client sends `{type: "scan"|"check", msgId, workUnitId, barcode, quantity?}` → server replies `{type: "scan_ack"|"check_ack", msgId, status, message?}`
- **Client hook**: `client/src/hooks/use-scan-websocket.ts` — auto-reconnect with exponential backoff, localStorage queue persistence for offline resilience, `sendScan`/`sendCheck` with external `msgId` support
- **Race-safe pattern**: All modules generate `msgId` via `generateMsgId()`, set `pendingScanContextRef` context BEFORE calling `sendScan`/`sendCheck`, ensuring ack handlers always find their context
- **Connection indicator**: `client/src/components/connection-status.tsx` — green/yellow/red dot with animation, shown in scanning header of all three modules
- **Module integration**: Separação and Balcão use `sendScan`; Conferência uses `sendCheck`. Both `processScanQueue` and `processIncrementQueue` in all modules now fire-and-forget via WebSocket instead of awaiting HTTP
- **Namespace isolation**: Each module passes a unique namespace (`separacao`, `conferencia`, `balcao`) to the hook, so localStorage pending queues are isolated per module
- **Context cleanup**: `pendingScanContextRef.current.clear()` + `clearWsQueue()` called on cancel, finalize, and context-switch in all modules, preventing stale acks AND stale replay messages
- **Server-side dedup**: `processedMsgIds` map caches responses by `msgId` for 5 minutes; replayed messages return the cached response instead of re-executing DB mutations
- **Ack-driven queue removal**: Pending queue messages are removed only when their specific ack arrives (not on flush), preventing message loss on reconnect
- **Max queue cap**: Pending queue limited to 100 messages to prevent unbounded growth during offline scanning
- **Per-connection message serialization**: `messageChains` Map chains each scan/check message sequentially per WebSocket connection, preventing same-operator DB lock contention (`FOR UPDATE NOWAIT` errors) and ensuring over_quantity guards see committed data

### Transaction & Atomicity Patterns
- **Atomic increments**: `atomicIncrementSeparatedQty` / `atomicIncrementCheckedQty` use `COALESCE(field, 0) + delta` SQL — used by HTTP scan endpoints (scan-item, check-item, balcao-item)
- **Atomic scan-check**: `atomicScanCheckedQty` uses `FOR UPDATE` row locking inside a transaction — reads `checked_qty`, validates against target, increments atomically. Prevents race conditions in conferência WS handler
- **Atomic resets**: `atomicResetItemAndWorkUnit` wraps item qty reset + work unit status reset + order status rollback in a single transaction — used by all over-quantity reset paths
- **Conference completion**: `checkAndCompleteConference` atomically marks WU as concluído AND updates order to conferido inside one transaction
- **Balcão completion**: `checkAndCompleteWorkUnit(id, true, "finalizado")` uses optional `finalOrderStatus` param to set order status atomically within the WU completion transaction
- **Separation completion**: `checkAndUpdateOrderStatus` runs its own transaction to check all WUs and set order to separado + create conference WU
- **Reset-item-picking**: Item resets + WU status update wrapped in single `db.transaction`
- **Status guards**: All completion/status-change endpoints check for `cancelado`/`finalizado` before updates to prevent status resurrection
- **Audit logs**: `complete_separation`, `complete_conference`, `complete_balcao` all create audit log entries
