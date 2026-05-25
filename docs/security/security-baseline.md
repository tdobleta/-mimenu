# MiMenu Security Baseline

## Goal

No restaurant should ever access, mutate, infer, export, or trigger operations against another restaurant's data.

Security is a product feature. For a restaurant platform, weak isolation can expose sales, customers, fiscal data, staff data, and payment configuration.

## Identity Model

Recommended model:

- `restaurants.owner_id` references `auth.users.id`.
- `team_members.user_id` references `auth.users.id`.
- `team_members.email` is metadata/invitation data, not the main authorization boundary.
- Roles are scoped to a restaurant and optionally to branches.

Avoid new authorization logic based only on email comparisons.

## Tenant Access Rules

Every tenant-owned record must be reachable through one of:

- `restaurant_id`
- `branch_id -> branches.restaurant_id`
- `turn_id -> turns.branch_id -> branches.restaurant_id`
- equivalent explicit relationship

Every sensitive function must verify the authenticated user belongs to the relevant tenant before using service role operations.

## RLS Rules

Required for every tenant table:

- RLS enabled.
- SELECT scoped to owned/member restaurant.
- INSERT `WITH CHECK` scoped to owned/member restaurant.
- UPDATE scoped both in `USING` and `WITH CHECK`.
- DELETE scoped and usually restricted by role.

Red flags:

- `USING (true)`
- `auth.role() = 'authenticated'` on tenant data
- email-only membership checks
- policies that only check branch existence but not user membership
- broad grants without strong RLS

## SECURITY DEFINER Rules

Any `SECURITY DEFINER` function must:

1. Set `search_path`.
2. Read `auth.uid()` or receive a verified actor.
3. Verify the actor belongs to the affected tenant.
4. Restrict role when needed.
5. Avoid unconstrained updates by raw ids.
6. Return safe errors.

Examples needing special scrutiny:

- closing tables
- cash withdrawals
- stock decrement
- customer points
- invoice state updates
- support/admin functions

## Edge Function Rules

Every sensitive Edge Function must:

- Authenticate JWT or validate a dedicated device token.
- Validate request body with a schema.
- Verify tenant/resource ownership.
- Use least-privilege provider credentials.
- Avoid CORS `*`.
- Avoid leaking debug internals.
- Rate limit when abuse or cost is possible.
- Write an operation/audit record for critical side effects.

## Secrets Rules

Never store in frontend, localStorage, or public bundles:

- Supabase service role key
- TusFacturas/AFIP credentials
- MercadoPago access tokens
- Resend API key
- Anthropic/OpenAI provider keys
- Upstash tokens
- private webhook secrets

Restaurant-specific provider credentials should be stored server-side and encrypted or otherwise protected according to the chosen platform capability.

## Payments Rules

- Use stable idempotency keys per business operation.
- Store payment intent records.
- Verify ownership before reading or polling payment status.
- Do not trust amount, restaurant id, branch id, or turn id from the browser without server-side validation.
- Log state transitions.

## Fiscal Rules

- Fiscal issuance must be server-side.
- Every invoice attempt must have a durable record.
- Successful fiscal records should be immutable except for controlled status metadata.
- Contingency records must not be fire-and-forget.
- Credentials must not be visible to staff browsers.

## Email Rules

- Email functions must verify tenant/resource ownership.
- HTML must escape user-provided content.
- CRM/bulk email must have rate limiting.
- Sending domain abuse must be monitored.

## Release Gate

Before production release:

- RLS tests for two restaurants.
- Edge Function authorization tests.
- Payment retry/idempotency tests.
- Fiscal credential exposure check.
- Secret scan.
- CORS review.
- Error leakage review.

