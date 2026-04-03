# Production Readiness Audit

## Objective
Comprehensive audit fixing critical, high, and medium severity issues across security, performance, stability, and code quality.

### T001: Security Hardening (Critical)
- **Blocked By**: []
- **Details**:
  - Add helmet for security headers
  - Add rate limiting on login + sensitive endpoints
  - Remove `json escape: false`
  - Fix error message information leakage
  - Files: `server/index.ts`, `server/routes.ts`, `package.json`

### T002: Transaction Safety & Race Conditions (Critical)
- **Blocked By**: []
- **Details**:
  - Wrap address import in transaction
  - Wrap counting cycle creation in transaction
  - Wrap counting item update + cycle status in transaction
  - Add SELECT FOR UPDATE on pallet allocation race condition
  - Wrap relaunchOrder and cancelOrderLaunch in transactions
  - Files: `server/wms-routes.ts`, `server/storage.ts`

### T003: Input Validation (High)
- **Blocked By**: []
- **Details**:
  - Add zod schemas for WMS route bodies (address create/update, pallet create, transfer, etc.)
  - Add JSON.parse try-catch safety
  - Files: `server/wms-routes.ts`

### T004: N+1 Query Optimization (High)
- **Blocked By**: []
- **Details**:
  - Fix getOrderItemsByOrderId N+1
  - Fix getAllAuditLogs N+1
  - Files: `server/storage.ts`

### T005: Frontend Polish & Missing data-testid (Medium)
- **Blocked By**: []
- **Details**:
  - Add missing data-testid to interactive elements across WMS pages
  - Files: `client/src/pages/wms/*.tsx`

### T006: Code Review & Final Validation
- **Blocked By**: [T001-T005]
- **Details**: Run architect code review, verify build, test endpoints
