# MiMenu Engineering Operating System

This repository is a restaurant SaaS/POS platform. Treat it as business-critical software: cash, payments, fiscal invoicing, inventory, staff permissions, customer data, and offline operations can affect real businesses.

## Mission

Bring MiMenu to a professional standard comparable to mature restaurant platforms such as Fudo, Toast, Lightspeed, Square for Restaurants, and similar products.

The goal is not only to make features work. The goal is to make the product safe, auditable, supportable, scalable, and sellable.

## Operating Principles

1. Protect tenant isolation before adding features.
2. Keep secrets, fiscal credentials, payment credentials, and sensitive business rules out of the browser.
3. Prefer small, reviewable changes with clear verification.
4. Do not rewrite large areas without an explicit migration plan.
5. Never weaken RLS, auth, idempotency, or auditability to make a UI flow easier.
6. Preserve existing user work and unrelated changes.
7. Every critical flow must have a rollback or recovery path.

## Critical Product Domains

- Multi-tenant security
- Supabase Auth, RLS, migrations, and RPCs
- Caja, shifts, arqueo, withdrawals, tips, and corrections
- POS, salon, kitchen, delivery, and table lifecycle
- MercadoPago payments and terminal flows
- AFIP/ARCA fiscal invoicing through TusFacturas or future providers
- Offline queue, sync, conflict recovery, and local operations
- Stock, recipes, egresos, ingresos, and inventory accuracy
- CRM, customers, reservations, receipts, and email delivery
- Deployment, observability, backups, support, and incident response

## Non-Negotiable Security Rules

- All tenant access must be scoped by `auth.uid()` and explicit restaurant/team membership.
- Do not use email-only membership as an authorization boundary for new code.
- Any `SECURITY DEFINER` function must validate caller authorization inside the function.
- Sensitive Edge Functions must validate ownership for the provided `restaurantId`, `branchId`, `turnId`, or related resource.
- No credentials for AFIP, MercadoPago, Resend, Anthropic, Supabase service role, or similar services may live in frontend code or localStorage.
- CORS `*` is not acceptable for sensitive functions.
- Public routes must not expose private restaurant data.
- Error responses must not leak stack traces, SQL errors, provider secrets, or internal debug details.

## Business-Critical Flow Requirements

For payments, invoicing, cash register operations, stock movement, and offline sync:

- Validate input with a schema.
- Authorize the actor.
- Use idempotency keys for retryable operations.
- Write an audit/event record.
- Return a clear success/failure state.
- Avoid fire-and-forget writes where data loss would matter.
- Prefer server-side transactions or database RPCs for atomic changes.

## Frontend Rules

- The frontend is an interface, not the source of authority for critical operations.
- UI role guards improve UX but are not security boundaries.
- Avoid duplicating business logic across pages.
- Keep direct Supabase writes for non-sensitive reads or low-risk configuration only; critical writes should move server-side.
- User-facing errors must be actionable.
- Avoid hiding operational failures with silent catches in critical flows.

## Database Rules

- Migrations are the source of truth.
- Avoid one-off SQL pasted manually without being captured in migrations.
- Every table containing tenant data must have RLS enabled and tested.
- Broad `GRANT ALL` must be justified by RLS and reviewed carefully.
- Any policy using `auth.role() = 'authenticated'` must be treated as suspicious unless the table is truly global and non-sensitive.

## Verification Standard

Before considering a critical change complete:

- Run or define unit tests for the touched logic.
- Run or define tenant-isolation tests for RLS/security changes.
- Run or define E2E tests for POS/caja/payment/fiscal/offline flows.
- Verify build/lint/typecheck when practical.
- Document any command that could not be run and why.

## Change Discipline

- Do not clean, delete, or revert unrelated files without explicit instruction.
- Do not modify production deploy settings without a plan.
- Do not install broad tooling into the repo without explaining the tradeoff.
- Prefer documentation and checklists before invasive refactors.

