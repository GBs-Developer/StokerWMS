# Objective
Implement WMS evolution across 6 phases: multi-company, addressing, receiving/pallets, check-in, transfer, counting cycles.

# Tasks

### T001: Schema changes for all phases
- **Blocked By**: []
- **Details**: Extend shared/schema.ts with new roles, tables, columns, types for all 6 phases
- **Files**: `shared/schema.ts`

### T002: Database migration support
- **Blocked By**: [T001]
- **Details**: Update server/db.ts auto-migrations to create all new tables/columns
- **Files**: `server/db.ts`

### T003: Auth & session with company support
- **Blocked By**: [T001]
- **Details**: Add company to auth session, select-company endpoint, update auth.ts and routes
- **Files**: `server/auth.ts`, `client/src/lib/auth.tsx`

### T004: Storage layer for WMS
- **Blocked By**: [T001]
- **Details**: Add WMS storage methods for addresses, pallets, movements, counting cycles, NF
- **Files**: `server/storage.ts`

### T005: Backend WMS routes
- **Blocked By**: [T003, T004]
- **Details**: Add all WMS API endpoints in a new file server/wms-routes.ts
- **Files**: `server/wms-routes.ts`, `server/routes.ts`

### T006: Frontend - Auth flow with company selector
- **Blocked By**: [T003]
- **Details**: Update login, add CompanySelectPage, update home page with new roles
- **Files**: `client/src/pages/login.tsx`, `client/src/pages/company-select.tsx`, `client/src/pages/home.tsx`, `client/src/App.tsx`

### T007: Frontend - WMS pages (addresses, receiving, check-in, transfer, counting)
- **Blocked By**: [T005, T006]
- **Details**: Create all WMS module pages
- **Files**: `client/src/pages/wms/`

### T008: Verify & test
- **Blocked By**: [T007]
- **Details**: Restart workflow, verify app loads, legacy modules work
