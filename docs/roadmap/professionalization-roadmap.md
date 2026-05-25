# MiMenu Professionalization Roadmap

## Purpose

This roadmap turns MiMenu from a broad functional app into a premium, sellable restaurant SaaS platform.

The strategic direction is local-first + cloud sync: easy to access like a modern web system, but resilient enough for restaurant service when internet or cloud connectivity fails.

## Phase 0: Repository And Environment Control

Outcome: the project can be developed and deployed without ambiguity.

Tasks:

- Clean `.gitignore` and generated artifacts.
- Separate local/staging/production environments.
- Confirm production Supabase project and deployed Edge Functions.
- Convert one-off SQL into ordered migrations.
- Document exact deploy flow.
- Fix encoding corruption in docs/UI text.
- Establish `WORKING-CONTEXT.md` updates as part of major work.

Exit criteria:

- New developer/agent can understand current state in under 30 minutes.
- Staging exists and is safe to test against.

## Phase 1: Multi-Tenant Security Foundation

Outcome: tenant isolation is reliable and testable.

Tasks:

- Audit all RLS policies.
- Remove email fallback from new authorization paths.
- Fix `stock_ingresos` policies.
- Review broad grants.
- Review all `SECURITY DEFINER` functions.
- Add RLS tests with restaurant A/B users.
- Document role matrix.

Exit criteria:

- Automated checks prove cross-tenant access fails.
- Every tenant table has explicit RLS rationale.

## Phase 2: Server-Side Command Layer

Outcome: critical business operations no longer depend on browser authority.

Tasks:

- Define command endpoints/functions.
- Move sensitive writes behind server-side validation.
- Standardize request/response/error format.
- Add idempotency model.
- Add audit/event model.

Exit criteria:

- Cash, payments, fiscal, email, stock, and invitations are server-authorized.

## Phase 3: Fiscal Invoicing

Outcome: AFIP/ARCA invoicing is secure, durable, and supportable.

Tasks:

- Remove fiscal credentials from localStorage/browser.
- Rebuild `facturar` as real fiscal function.
- Store invoice attempts and results.
- Support contingency and retry workflows.
- Add provider error mapping.
- Add fiscal E2E verification.

Exit criteria:

- A production client can issue invoices without exposing credentials.

## Phase 4: MercadoPago And Payment Reliability

Outcome: payment flows are safe under retries and failures.

Tasks:

- Add stable idempotency keys.
- Verify ownership in status polling.
- Persist payment intents.
- Model payment states.
- Add timeout/expiration/cancel flows.
- Add tests for duplicate click/retry cases.

Exit criteria:

- No duplicate payment is created by normal retries.

## Phase 5: Caja, Stock, And Offline Integrity

Outcome: restaurant operations stay consistent under real-world conditions.

Tasks:

- Make close table/caja flows transactional.
- Complete offline stock decrement strategy.
- Add dead-letter recovery UI.
- Clarify what is allowed offline.
- Add conflict recovery for duplicate closes or stale devices.
- Make audit logs durable and meaningful.

Exit criteria:

- Offline recovery can be explained and tested.

## Phase 6: Kitchen, Devices, And Local Operations

Outcome: kitchen and device flows are safe and easy to operate.

Tasks:

- Remove or migrate legacy `/public/cocina`.
- Strengthen device token lifecycle.
- Add device last-seen and revoke flows.
- Treat LAN relay as notification only.
- Validate mixed-content/browser constraints for local relay.

Exit criteria:

- Kitchen display cannot access or mutate other branches.

## Phase 7: Product UX And Onboarding

Outcome: customers can configure and understand the product without founder support.

Tasks:

- Build setup checklist.
- Improve empty/error states.
- Separate demo mode from real production mode.
- Add fiscal/payment setup validation.
- Add support-friendly screens for devices, pending sync, and failed operations.

Exit criteria:

- A new restaurant can reach first successful service flow with minimal hand-holding.

## Phase 8: Observability, Support, And Runbooks

Outcome: failures can be diagnosed quickly.

Tasks:

- Add Sentry context: restaurant, branch, role, version.
- Make health checks private/safe.
- Add Edge Function logs strategy.
- Build internal support/admin dashboard.
- Test backup restore.
- Expand runbooks for fiscal/payment/offline incidents.

Exit criteria:

- Support can answer "what happened?" without direct database guessing.

## Phase 9: Testing And Release Gates

Outcome: shipping becomes safer.

Tasks:

- Replace shallow tests with production imports.
- Add RLS tests.
- Add Edge Function tests.
- Add Playwright E2E tests.
- Add release checklist.
- Add pre-production smoke test.

Exit criteria:

- Critical flows have automated or documented verification.

## Phase 10: Commercial Scale

Outcome: MiMenu can onboard and manage paying customers.

Tasks:

- Finalize plans/limits.
- Harden subscription lifecycle.
- Add internal customer admin.
- Add usage metrics.
- Add customer docs.
- Add support processes.

Exit criteria:

- The product is ready for controlled paid rollout.

## Recommended First Execution Block

Start with "Foundation P0":

1. Environment/repo hygiene.
2. RLS and tenant isolation.
3. `SECURITY DEFINER` audit.
4. Fiscal credentials moved server-side.
5. MercadoPago ownership/idempotency.
6. Email abuse prevention.
7. Minimal security tests.

## Scale Readiness Thread

This thread runs across all phases and must not be postponed until the end.

Focus areas:

- branch-scoped realtime;
- idempotent operations;
- retry-safe sync;
- database indexes for hot paths;
- separation of transactional flows from analytics/reporting;
- Sentry/log context with restaurant, branch, device, and operation ids;
- staged rollout and feature flags for risky migrations;
- load-aware design for 1000+ daily active users.
