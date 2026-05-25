# MiMenu Working Context

This file is the living context for MiMenu's professionalization effort. Keep it updated when major decisions, risks, or phases change.

## Current Product Position

MiMenu is a React/Vite restaurant POS and management application backed by Supabase. It includes salon/table management, POS, kitchen display, caja, stock, CRM, reservations, delivery, reporting, fiscal invoicing, MercadoPago flows, PWA/offline support, and a local LAN relay.

The product is promising and broad, but the current architecture still mixes critical business logic between frontend code, Supabase direct access, SQL RPCs, and Edge Functions. The next phase is to convert it into a reliable SaaS platform.

## Product Direction Decisions

- Primary market: Argentina.
- Deployment direction: local installation for restaurant computers plus online synchronization.
- Kitchen/production display: must support restaurant monitor workflows.
- Offline expectation: the restaurant should be able to keep operating without internet.
- Offline cash/card/manual operations: closing and charging tables offline should be supported when the payment method allows it.
- Online provider operations: MercadoPago terminal flows and AFIP/ARCA fiscal issuance need explicit pending/blocked/retry states when offline.
- Technology posture: open to changing platforms if it improves reliability, maintainability, or product quality.
- Official architecture direction: combine Fudo-like ease of access with Toast-like operational resilience.
- Target scale: design for 1000+ daily active users from the beginning, including many restaurants operating concurrently during peak service.

## Current Stack

- Frontend: React, Vite, Tailwind/Radix-style UI components
- Backend/data: Supabase Auth, Postgres, RLS, Realtime, Storage
- Server-side functions: Supabase Edge Functions
- Deployment: Netlify currently; Cloudflare Pages/Workers under consideration
- Observability: Sentry, health function, runbook
- Offline: IndexedDB queue, snapshot cache, PWA
- Local operations: WebSocket relay in `local-server`

## Known High-Risk Areas

1. Tenant isolation has inconsistent patterns. Some policies/functions still rely on email-based membership.
2. Some RLS policies are too broad, especially around `stock_ingresos`.
3. Several `SECURITY DEFINER` RPCs need explicit authorization checks.
4. AFIP/TusFacturas credentials are exposed to frontend/localStorage paths.
5. The `facturar` Edge Function appears to be a copied chat function instead of a fiscal backend.
6. MercadoPago status/payment flows need stronger ownership checks and idempotency.
7. Email functions can potentially be abused without tenant/resource validation.
8. Staff PINs are stored/verified client-side and should not be treated as strong security.
9. Offline sync exists but is incomplete for stock decrement and recovery workflows.
10. Repo hygiene and documentation are not yet production-grade.

## Current Strategic Decision

Do not add major features until the P0 foundation is addressed:

- Multi-tenant security
- Fiscal invoicing server-side
- Payment safety and idempotency
- Email abuse prevention
- Caja/stock/offline integrity
- Clean environments and deploy discipline

## Architecture Direction

The target architecture is:

- React frontend for UI/UX.
- Local-first application/runtime for restaurant devices, to be decided after technical evaluation.
- Supabase Postgres/Auth/Realtime as core data platform.
- Server-side API layer for all sensitive operations.
- RLS as a strict final data boundary.
- Edge/Worker functions for payments, fiscal, email, invitations, device operations, and business commands.
- Idempotent operation/event model for critical flows.
- Staging and production environments separated.
- Operation-based synchronization, not isolated update synchronization.
- Local continuity for service hours, cloud consolidation for cross-device/cloud truth.

## First Operation Contract

The first operation contract is `CLOSE_TABLE_OPERATION`, documented in `docs/architecture/close-table-operation.md`.

This contract is the migration bridge from the current small offline `CLOSE_TABLE` queue item to a complete business operation that can safely distribute effects to caja, stock, fiscal records, audit logs, reports, and realtime devices.

## Current Execution Plan

The active master execution plan is `docs/roadmap/fudo-level-execution-plan.md`.

That plan is the working path for taking MiMenu to Fudo-level operational quality: simple restaurant workflows, local/offline continuity, idempotent business operations, server-side fiscal/payment safety, and supportable production behavior.

## Do Not Forget

- The product needs to work in real restaurants with unstable internet.
- Cash, fiscal invoices, payments, and stock are not cosmetic features.
- Supportability matters as much as feature count.
- A small team can still operate with big-company discipline.
