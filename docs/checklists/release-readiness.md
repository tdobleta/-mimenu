# MiMenu Release Readiness Checklist

Use this before staging pilots, production deploys, and customer rollouts.

## Scope

- [ ] Release scope is defined.
- [ ] Risk level is assigned: low, medium, high, critical.
- [ ] Rollback plan exists.
- [ ] Customer impact is understood.
- [ ] Support notes are written if needed.

## Security

- [ ] No secrets in frontend code, localStorage paths, logs, or public bundles.
- [ ] RLS impact reviewed.
- [ ] Tenant isolation tested or manually verified.
- [ ] Edge Functions validate ownership.
- [ ] `SECURITY DEFINER` changes reviewed.
- [ ] CORS reviewed.
- [ ] Public routes reviewed for data exposure.
- [ ] Error responses do not leak internals.

## Payments

- [ ] Idempotency key is stable.
- [ ] Payment state transitions are stored.
- [ ] Duplicate-click/retry behavior verified.
- [ ] Ownership checks verified.
- [ ] Provider failures have user-facing states.

## Fiscal Invoicing

- [ ] Fiscal credentials stay server-side.
- [ ] Invoice attempts are durable.
- [ ] Successful invoices are recorded.
- [ ] Contingency flow is tested.
- [ ] Retry flow is tested.
- [ ] Provider errors are understandable.

## Caja And POS

- [ ] Open/close shift tested.
- [ ] Open/close table tested.
- [ ] Mixed payments tested if touched.
- [ ] Tips/discounts tested if touched.
- [ ] Withdrawals tested if touched.
- [ ] Audit log entries exist for critical operations.

## Offline

- [ ] Behavior without internet is defined.
- [ ] Queue operation is idempotent.
- [ ] Sync recovery tested.
- [ ] Dead-letter path is visible or documented.
- [ ] Stock effects are accounted for.

## Data And Migrations

- [ ] Migration is reversible or has remediation plan.
- [ ] Migration was tested on staging.
- [ ] Existing data compatibility checked.
- [ ] Index impact considered.
- [ ] Backups verified for production-impacting changes.

## Frontend UX

- [ ] Loading states exist.
- [ ] Empty states exist.
- [ ] Error states are actionable.
- [ ] Mobile/tablet layout checked for touched screens.
- [ ] Critical buttons prevent duplicate submission.

## Observability

- [ ] Sentry context is present where relevant.
- [ ] Edge/server logs are useful.
- [ ] Health checks still pass.
- [ ] Support can diagnose common failures.

## Verification

- [ ] `npm run lint` run or reason documented.
- [ ] `npm run typecheck` run or reason documented.
- [ ] `npm run test` run or reason documented.
- [ ] Build run or reason documented.
- [ ] E2E/smoke test run for critical flows.

## Release Decision

- [ ] Ready for staging.
- [ ] Ready for production.
- [ ] Requires owner approval.
- [ ] Requires customer communication.

