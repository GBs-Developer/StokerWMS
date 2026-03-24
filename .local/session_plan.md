# Objective
Refactor Stokar WMS for full multi-company segregation, refactor separation module from section-based to route-based with order-level locking, and harden security.

# Tasks

### T001: Centralize company configuration
- **Blocked By**: []
- **Details**:
  - Create centralized company config (pickup points per company for operations vs reports)
  - Remove hardcoded `companyId === 1` checks from storage.ts and routes.ts
  - Files: `shared/schema.ts`, `server/storage.ts`, `server/company-config.ts` (new)
  - Acceptance: Company rules are in one place, not scattered

### T002: Backend company segregation on all routes
- **Blocked By**: [T001]
- **Details**:
  - Add `requireCompany` to all legacy routes that need it
  - Validate company ownership on single-resource endpoints (orders/:id, work-units/:id)
  - Filter all queries by company context
  - Files: `server/routes.ts`, `server/storage.ts`, `server/auth.ts`
  - Acceptance: No route returns data from wrong company

### T003: Refactor separation module - backend
- **Blocked By**: [T001]
- **Details**:
  - Change work unit creation: ONE separation WU per order (like conference)
  - Work units for separation show ALL items (not filtered by section)
  - Order-level atomic locking for separation (two separators can't access same order)
  - Remove/adapt pickingSessions table (section-based locking → order-level locking)
  - Files: `server/storage.ts`, `server/routes.ts`
  - Acceptance: Separation WUs contain all items, locking is per-order

### T004: Refactor separation module - frontend
- **Blocked By**: [T003]
- **Details**:
  - Remove section filter from user sections
  - Add route-based filtering as primary filter
  - Separator sees all sections of order
  - Update UI for complete order separation flow
  - Files: `client/src/pages/separacao/index.tsx`
  - Acceptance: Separator can see and pick all items per order, filtered by route

### T005: Security hardening and cache invalidation
- **Blocked By**: [T002]
- **Details**:
  - Ensure company switch invalidates all local state/cache
  - Backend rejects cross-company access on every mutation
  - SSE events respect company context
  - Files: `client/src/lib/auth.tsx`, `server/sse.ts`, `server/routes.ts`
  - Acceptance: No cross-company data leakage possible

### T006: Testing and verification
- **Blocked By**: [T003, T004, T005]
- **Details**:
  - Verify all endpoints filter by company
  - Test separation flow end to end
  - Test conference flow
  - Test company switching
  - Screenshot and verify UI
  - Files: all
  - Acceptance: App runs stable, no cross-company data
