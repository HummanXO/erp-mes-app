# App Entry Points (Frontend + Backend)

## Frontend

Public API is unchanged:
- `lib/app-context.tsx` — root provider + `useApp()` hook.

Domain entrypoints used by the root provider:
- `lib/app/auth/use-auth-domain.ts` — auth init/login/logout/demo-date/reset.
- `lib/app/parts/use-parts-domain.ts` — parts, stage facts, machine norms, part progress/forecast selectors.
- `lib/app/tasks/use-tasks-domain.ts` — task actions, comments/review workflow, task selectors.
- `lib/app/inventory/use-inventory-domain.ts` — logistics + inventory actions/selectors.
- `lib/app/specs/use-specs-domain.ts` — specifications/work-orders/access grants.
- `lib/app/shared/use-refresh-data.ts` — unified data reload pipeline.
- `lib/app/shared/use-visibility.ts` — per-user visibility filters for parts/specifications.
- `lib/app/shared/use-lookup-selectors.ts` — basic entity lookup selectors.
- `lib/app/context-types.ts` — `AppContextType` contract.

## Backend

Canonical ORM models live only here:
- `backend/app/models.py`

API vertical slices:
- `backend/app/routers/inventory.py` + `backend/app/use_cases/inventory_slice.py` (Inventory Slice #1: movements list/create in API mode)

There are no alternative runtime model files in `backend/app`.
