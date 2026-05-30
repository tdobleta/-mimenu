# MIMENU MASTER PLAN — SECURITY, ARCHITECTURE & RELEASE READINESS

**Version:** 1.3 — 2026-05-30
**Status:** ACTIVE — Employee UI blocked on P0 closure
**Gate:** 0-C COMPLETE (production corroborated). E1C-A1 SQL remediation DESIGN is UNBLOCKED. Migration writing/applying requires separate review.

---

## STRATEGIC RULE

No employee-facing Login UI or real employee operational access may be implemented or released until all confirmed P0 authorization vulnerabilities are fixed and validated server-side.

UI visibility is not authorization. Server-side enforcement is required for every permission boundary.

---

## 1. EXECUTIVE STATE SUMMARY

MiMenu is a cloud-first restaurant POS SaaS (browser/PWA). The product has a working owner/team-member authentication layer, financial calculation hardening for close-table operations, device mode separation, and a deployed-and-tested employee login Edge Function.

**8 P0 authorization vulnerabilities confirmed active in production.** The original 5 P0s from the initial audit were expanded to 8 after Gate 0-B repository verification. All 8 have been corroborated against the live Supabase production database via read-only SQL catalog queries (Gate 0-C, completed 2026-05-30). Effective `has_function_privilege` checks confirmed that vulnerable SECURITY DEFINER functions are callable by `anon` and `authenticated` roles in production. RLS policy queries confirmed that permissive policies defeat intended restrictions on `stock_ingresos` and `team_members`.

Production corroboration also verified:
- Employee login rate-limiting RPCs are correctly restricted to `service_role` only.
- Operational SECURITY DEFINER functions (`sync_close_table_operation`, `apply_sales_operation`, `open/close_caja_shift_operation`, delivery operations, `decrement_stock_with_egreso`) contain adequate tenant/role guards.
- `cerrar_mesa_atomico` has three production overloads (7-arg, 9-arg, 11-arg); the 7-arg legacy overload also bypasses newer discount/points validation.
- RLS is enabled on all critical tables; P0s arise from policy/function authorization defects, not disabled RLS.
- `rls_auto_enable` is an event trigger utility (not a data mutation risk) but has unnecessary PUBLIC execute (tracked as HARD-1).

### Phase 0 status correction

Financial *calculation* integrity fixes (discount validation, duplicate close prevention, points redemption validation) are implemented and deployed. However, **full financial security closure is pending** — the same financial RPCs that perform validated calculations (`cerrar_mesa_atomico`) can be called cross-tenant, bypassing all calculation integrity. Calculation correctness without authorization is not security closure.

### Architecture

The employee login Edge Function works end-to-end for credential verification, but the custom JWT it issues cannot operate the Supabase data layer. The chosen architecture (Variant C2: passwordless Supabase Auth session bridge) is sound but **blocked** until all P0 authorization holes are closed.

**Current deployment:** Branch `main` at commit `706737ca`. Working tree clean. All employee login migrations applied in production. No employee Login UI exists in the frontend.

---

## 2. COMPLETED & PRODUCTION-VALIDATED CAPABILITIES

### Phase 0 — Financial Calculation Integrity (deployed, authorization pending)

| Commit | Capability | Calculation Status | Authorization Status |
|--------|-----------|-------------------|---------------------|
| `b1ebbb5c` | Server-side discount validation in `cerrar_mesa_atomico` | CLOSED | OPEN — `cerrar_mesa_atomico` callable cross-tenant (P0-6) |
| `994e6d30` | Duplicate close-table prevention (FOR UPDATE + status check) | CLOSED | OPEN — same as above |
| `d03515d3` | Close-table details shown in caja activity | CLOSED | N/A (read-only UI) |
| `6ac17dc2` | Server-side points redemption validation | CLOSED | OPEN — `decrement_customer_points` callable cross-tenant (P0-4) |

**Remaining financial risk:** Points *earning* is still client-trusted. The client computes `puntosGanados` and calls `increment_customer_points` directly. This is tracked as deferred financial hardening (FIN-1).

### Phase 1 — Device Mode & PWA (all deployed, secure)

| Commit | Capability |
|--------|-----------|
| `c136f947` | Device mode foundation (localStorage, context) |
| `9ee1eaa5` | Sidebar filtering by device mode |
| `9aef80fd` | KDS device mode polish |
| `58d213cb` | PWA installability essentials (manifest, service worker) |
| `63841b38` | PWA install prompt UI |
| `6202277e` | Fail-closed for unknown roles; device mode vs role clarification |

**Confirmed:** Device mode is UI-only. Zero interaction with authentication, authorization, or RLS.

### Employee Login Foundation (deployed, transitional)

| Commit | Capability |
|--------|-----------|
| `4faa719e` | `employee_logins` table, `employee_login_attempts` table, 3 rate-limiting RPCs (service_role only). Manually applied in production. |
| `9f9697a4` | `employee-login` Edge Function: slug lookup, bcrypt verify, timing-safe dummy hash, input validation, HS256 JWT signing |
| `706737ca` | Hotfix: `npm:bcryptjs@3.0.3` replacing Worker-incompatible `deno.land/x/bcrypt` |

**Production verification passed.** Custom JWT is transitional — cannot operate Supabase data layer.

---

## 3. ARCHITECTURE DECISIONS LOCKED

### A3-1: Employee Visible Login Model
`restaurant_code + username + password`. Employee never selects their own role. Role and permissions are assigned by admin and enforced server-side.

### A3-2: Employee Session Architecture — Variant C2
- `employee_logins.password_hash` remains the password source (bcrypt, edge function only).
- Supabase Auth provides the operational session identity via passwordless `auth.users` entries.
- Flow: Edge Function validates credentials → `admin.generateLink({ type: 'magiclink' })` → return `token_hash` → frontend calls `verifyOtp()` → real Supabase session.
- Requires: `auth_user_id` column on `employee_logins` (does not exist yet), `team_members` row per employee.
- **Blocked** until all P0s are closed.

### A3-3: Role Hierarchy
- **Dueño**: Identified by `restaurants.owner_id = auth.uid()`. Full access. Not a `team_members.rol` value.
- **Encargado**: Can manage Mozo/Cocinero. Cannot self-promote to Dueño. Cannot modify/delete Dueño.
- **Mozo / Cocinero**: Operational roles. Cannot modify team members, menu, branches, fiscal config, stock admin, or caja management.

### A3-4: PIN System Transition
Staff PINs remain as transitional/shared-device identification. `employee_logins.staff_pin_id` FK exists for future linkage. PIN is not employee identity.

### A3-5: Device Mode Separation
Device mode is UI-only (localStorage). Controls default route and sidebar filtering. Never grants, restricts, or implies permissions. Authorization is always server-side.

### A3-6: Role Source of Truth for RLS
`team_members.rol` is authoritative for RLS (read by `get_user_role()`). `employee_logins.rol` must sync from it or be deprecated. The `permisos` JSONB array has no RLS counterpart yet.

### A3-7: Tenant Isolation Primitives
Three helper functions form the authorization foundation:
- `get_user_restaurant_id()` — resolves caller's restaurant via `restaurants.owner_id` or `team_members.user_id`
- `get_user_role()` — returns 'Dueno', or `team_members.rol`
- `user_owns_branch(uuid)` — checks branch belongs to caller's restaurant

All three are SECURITY DEFINER and intentionally PUBLIC — they are used inside RLS policies and other SECURITY DEFINER functions.

---

## 4. ACTIVE RISK REGISTER

### P0 — Critical Authorization Vulnerabilities (8 confirmed, all blocking)

---

**P0-1: `stock_ingresos` RLS — Cross-Tenant Data Access**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant read/write |
| **Location** | `20260524000099_master_setup.sql` lines 380-383 |
| **Active policy** | `USING (auth.role() = 'authenticated')` — no tenant check |
| **Regression** | master_setup overwrote earlier migration; no subsequent fix |
| **Exploit** | `supabase.from('stock_ingresos').select('*')` returns all tenants' data |
| **Impact** | Cross-tenant read/write of cost, supplier, stock intake data |
| **Fix direction** | Replace with `USING (user_owns_branch(branch_id))` / `WITH CHECK (user_owns_branch(branch_id))` |
| **Pre-fix evidence** | Query as user from different tenant; confirm rows returned |
| **Post-fix test** | Same query returns 0 rows; INSERT to foreign branch returns 42501 |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | Three permissive policies active: `stock_ingresos_branch` (FOR ALL, tenant-scoped via `user_owns_branch`), `stock_ingresos_read` (SELECT, `auth.role() = 'authenticated'`), `stock_ingresos_insert` (INSERT, `auth.role() = 'authenticated'`). The permissive read/insert policies bypass tenant isolation — any authenticated user can read all tenants' data and insert into any branch. |
| **Closure** | Migration applied + production verification + no regression |

---

**P0-2: `get_top_products` — Cross-Tenant Sales Data Exposure**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant information disclosure |
| **Location** | `schema.sql` lines 278-294 |
| **Issue** | SECURITY DEFINER, accepts arbitrary `p_branch_id`, no ownership check, PUBLIC execute |
| **Exploit** | `supabase.rpc('get_top_products', { p_branch_id: '<victim>' })` |
| **Impact** | Competitor sales/product intelligence exposure |
| **Fix direction** | Convert SQL→PL/pgSQL; add `IF NOT user_owns_branch(p_branch_id) THEN RETURN; END IF;` |
| **Post-fix test** | Cross-tenant call returns empty result |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | SECURITY DEFINER active; function body accepts arbitrary `p_branch_id` with no tenant check. `has_function_privilege` confirms anon=true, authenticated=true. NULL ACL (PUBLIC default). |
| **Closure** | Migration applied + production verification |

---

**P0-3: `get_facturacion_range` — Cross-Tenant Revenue Exposure**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant financial information disclosure |
| **Location** | `schema.sql` lines 296-308 |
| **Issue** | Identical to P0-2: SECURITY DEFINER, no ownership check, PUBLIC execute |
| **Exploit** | `supabase.rpc('get_facturacion_range', { p_branch_id: '<victim>' })` |
| **Impact** | Revenue, average ticket, transaction count of any tenant exposed |
| **Fix direction** | Same as P0-2 |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | SECURITY DEFINER active; function body accepts arbitrary `p_branch_id` with no tenant check. `has_function_privilege` confirms anon=true, authenticated=true. NULL ACL (PUBLIC default). |
| **Closure** | Migration applied + production verification |

---

**P0-4: `increment/decrement_customer_points` — Cross-Tenant Points Manipulation**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant financial mutation |
| **Location** | `20260524000099_master_setup.sql` lines 509-517 |
| **Issue** | SECURITY DEFINER, accepts arbitrary `p_id`, no tenant check, PUBLIC execute |
| **Exploit** | `supabase.rpc('increment_customer_points', { p_id: '<any_customer>', p_pts: 999999 })` |
| **Impact** | Cross-tenant loyalty fraud; manufactured monetary value |
| **Fix direction** | Add tenant guard: `WHERE id = p_id AND restaurant_id = get_user_restaurant_id()`. Convert to PL/pgSQL. |
| **Deferred** | Points earning client-trust is separate (FIN-1). Tenant isolation is the immediate P0 fix; full financial closure also requires points earning to become server-trusted rather than client-computed. |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | Both functions SECURITY DEFINER active; update `customers.puntos` from caller-supplied `p_id`/`p_pts` without tenant or role validation. `has_function_privilege` confirms anon=true, authenticated=true for both. NULL ACL (PUBLIC default). |
| **Closure** | Migration applied + production verification |

---

**P0-5: `team_members` — Privilege Escalation & Member Manipulation**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — privilege escalation within tenant |
| **Location** | `20260522000002_rls_policies.sql` lines 114-117 |
| **Active policy** | `FOR ALL TO authenticated USING (restaurant_id = get_user_restaurant_id())` |
| **Exploit** | Mozo: `supabase.from('team_members').update({ rol: 'Encargado' }).eq('user_id', auth.uid())` |
| **Impact** | Self-promotion, member deletion, management takeover |
| **Fix direction** | Split into SELECT (all) + INSERT/UPDATE/DELETE (role-restricted with hierarchy) |
| **Constraints** | Encargado cannot self-promote to Dueño. Cannot promote/create Dueño. Cannot modify/delete Dueño. `invite-member` uses service_role (no break). |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | Permissive `team_members_restaurant` FOR ALL policy active, scoped only by `restaurant_id = get_user_restaurant_id()`. Coexists with a stricter `team_members_write` policy, but permissive policies combine via OR — the broad FOR ALL policy defeats the write restriction. Any team member can UPDATE their own `rol`, DELETE other members. |
| **Closure** | Migration applied + production verification + invite-member verified |

---

**P0-6: `cerrar_mesa_atomico` — Cross-Tenant Table Close (PROMOTED FROM P1-A)**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant financial mutation |
| **Location** | `20260528000002_server_points_validation.sql` lines 16-150 |
| **Issue** | SECURITY DEFINER with three production overloads (7, 9, 11 args), all lacking caller tenant authorization on `p_turn_id`. The 7-arg legacy overload also bypasses newer discount/points validation. No GRANT/REVOKE (PUBLIC execute). |
| **Wrapper** | `sync_close_table_operation` validates tenancy, but raw RPC is independently callable |
| **Exploit** | `supabase.rpc('cerrar_mesa_atomico', { p_turn_id: '<victim_turn>', p_total: 0, p_propina: 0, p_metodo: 'efectivo', p_mozo: 'attacker' })` |
| **Impact** | Close any tenant's open turn with zero total. Corrupt sales data. Drain loyalty points. The 7-arg overload additionally bypasses discount and points validation. Most severe financial mutation in the platform. |
| **Fix direction** | DROP legacy 7-arg and 9-arg overloads. REVOKE ALL on 11-arg from PUBLIC/anon/authenticated — only `sync_close_table_operation` (which validates tenancy) should call it internally. Add defense-in-depth tenant check inside function body. |
| **Post-fix test** | Direct RPC call returns permission denied; close-table via sync wrapper still works; legacy overloads no longer exist |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | Three SECURITY DEFINER overloads active (7, 9, 11 args). All lack tenant check. `has_function_privilege` confirms anon=true, authenticated=true for all three. NULL ACL (PUBLIC default). |
| **Closure** | Migration applied + production verification + close-table flow unbroken |

---

**P0-7: `append_caja_retiro` — Cross-Tenant Cash Ledger Injection (PROMOTED FROM P1-B)**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant financial mutation |
| **Location** | `20260524000099_master_setup.sql` lines 484-494 |
| **Issue** | SECURITY DEFINER, no tenant check on `p_shift_id`, no role check, PUBLIC execute |
| **Exploit** | `supabase.rpc('append_caja_retiro', { p_shift_id: '<any_shift>', p_retiro_json: '{"monto": 99999}' })` |
| **Impact** | Inject fabricated cash withdrawal records into any restaurant's caja shift |
| **Fix direction** | Add tenant check via `get_user_restaurant_id()` against shift's branch. Add role check (Dueño/Encargado). REVOKE from PUBLIC. |
| **Post-fix test** | Cross-tenant call raises error; own-tenant Encargado call succeeds |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | SECURITY DEFINER active; updates `caja_shifts.retiros` from caller-supplied `p_shift_id`/`p_retiro_json` with no tenant or role validation. `has_function_privilege` confirms anon=true, authenticated=true. NULL ACL (PUBLIC default). |
| **Closure** | Migration applied + production verification |

---

**P0-8: `decrement_stock` (legacy 2-param) — Cross-Tenant Inventory Sabotage (PROMOTED FROM P1-C)**

| Field | Detail |
|-------|--------|
| **Severity** | P0 — cross-tenant mutation |
| **Location** | `20260524000099_master_setup.sql` lines 498-506 (also `20260522000003_atomic_rpcs.sql` lines 57-69) |
| **Issue** | SECURITY DEFINER, accepts arbitrary `p_id` (stock_items UUID), no tenant check, PUBLIC execute |
| **Note** | Newer replacements `decrement_stock_with_egreso` and `increment_stock_with_ingreso` are properly tenant-scoped. This legacy function was never dropped. |
| **Exploit** | `supabase.rpc('decrement_stock', { p_id: '<any_stock_item>', p_qty: 999999 })` |
| **Impact** | Drain any tenant's stock to zero |
| **Fix direction** | DROP function entirely — superseded by `decrement_stock_with_egreso`. Verify no remaining callers. |
| **Post-fix test** | Function no longer exists; `decrement_stock_with_egreso` works normally |
| **Production corroboration** | **Confirmed** — 2026-05-30 |
| **Production evidence** | Legacy `decrement_stock(p_id uuid, p_qty numeric)` SECURITY DEFINER active with no tenant check. `has_function_privilege` confirms anon=true, authenticated=true. NULL ACL (PUBLIC default). Safe replacement `decrement_stock_with_egreso` coexists with proper tenant validation. |
| **Closure** | Migration applied + production verification + no callers broken |

---

### SECURITY DEFINER Inventory Summary (production-verified 2026-05-30)

| Classification | Count | Functions | Verification |
|---------------|-------|-----------|-------------|
| **SAFE — has tenant/role validation** | 13 | `get_user_restaurant_id`, `get_user_role`, `user_owns_branch`, `sync_close_table_operation`, `apply_sales_operation`, `close_caja_shift_operation`, `open_caja_shift_operation`, `archive_customer_operation`, `create_factura_contingencia`, `create_delivery_order_operation`, `update_delivery_order_operation`, `decrement_stock_with_egreso`, `increment_stock_with_ingreso` | Part C supplemental query confirmed tenant/role guards in function bodies |
| **SAFE — service_role only** | 3 | `check_employee_login_lockout`, `record_employee_login_failure`, `clear_employee_login_attempts` | `has_function_privilege` confirmed anon=false, authenticated=false, service_role=true. Earlier Block 8 `execute_access_summary` was misleading for explicit ACLs; corrected via effective privilege checks. |
| **SAFE — utility (event trigger)** | 1 | `rls_auto_enable` | Event trigger function that enables RLS on new public tables. Does not disable RLS, modify policies, or touch user data. Track as HARD-1 for unnecessary PUBLIC execute privilege. |
| **VULNERABLE (P0)** | 7 functions (10 overloads) | `cerrar_mesa_atomico` (3 overloads: 7/9/11 args), `append_caja_retiro`, `decrement_stock`, `increment_customer_points`, `decrement_customer_points`, `get_top_products`, `get_facturacion_range` | `has_function_privilege` confirmed anon=true, authenticated=true for all. NULL ACL (PUBLIC default). |

### Deferred Risks (not P0, tracked separately)

| ID | Issue | Status |
|----|-------|--------|
| FIN-1 | Points earning is client-trusted (`increment_customer_points` called with client-computed value) | Tenant isolation fix addresses cross-tenant vector. Client-trust fix deferred: move earning calculation into `cerrar_mesa_atomico` so earned points are computed from server-verified final total. |
| FIN-2 | `customer_visits` inserts are client-driven | Lower severity — fabricated visit records. Track for future hardening. |
| FIN-3 | `increment/decrement_customer_points` may need role restriction beyond tenant isolation | Evaluate during Mozo authorization gates (E1C-B). |
| AUDIT-1 | `sync_close_table_operation` derives `actor_user_id` from client payload instead of trusted `auth.uid()` | Tenant guard is present (not cross-tenant P0). However, the actor identity recorded in audit logs is client-asserted, not server-verified. Track for audit integrity hardening. |
| AUTHZ-1 | Delivery order operations (`create_delivery_order_operation`, `update_delivery_order_operation`) have tenant gates but broad role access | Product decision needed: should Mozo be allowed to create/update delivery orders? Currently permitted. Track for Gate 2 role-gate review. |
| HARD-1 | `rls_auto_enable` has unnecessary PUBLIC execute privilege | Event trigger utility — not a data mutation risk. REVOKE from anon/authenticated to follow minimum-privilege principle while preserving event-trigger defensive function. Track for Gate 2 hardening. |

---

## 5. BLOCKED FEATURES AND WHY

| Feature | Blocked by | Reason |
|---------|-----------|--------|
| Employee Login UI | P0-1 through P0-8 | Granting employees real Supabase sessions amplifies every cross-tenant and privilege-escalation vulnerability |
| C2 Session Bridge | P0-1 through P0-8 | Session bridge creates auth.users entries that directly call PostgREST |
| `auth_user_id` migration | P0 closure | Column is safe to add but meaningless without session bridge |
| Employee management UI | C2 + Login UI | Depends on complete employee login infrastructure |
| Mozo operational restrictions | P0-5 (team_members) | Role-based gates depend on trustworthy role hierarchy |
| Public launch / onboarding | All P0s | Cross-tenant data exposure is breach-class |

---

## 6. UPDATED ROADMAP WITH GATES

```
GATE 0-A — Confirmed P0 register ✅ COMPLETE (v1.0)
    5 P0 vulnerabilities documented with evidence

GATE 0-B — P0 expansion verification ✅ COMPLETE (v1.1)
    3 promoted to P0 (cerrar_mesa_atomico, append_caja_retiro, decrement_stock)
    Full SECURITY DEFINER inventory complete (repository)
    Total repository-confirmed P0: 8

GATE 0-C — Production read-only corroboration ✅ COMPLETE (v1.3)
    All 8 P0s confirmed active in production via catalog queries
    Effective has_function_privilege checks corroborated exploitability
    Supplemental verification confirmed safe functions have tenant guards
    Employee login RPCs confirmed service_role only
    rls_auto_enable classified as utility (HARD-1)
    sync_close_table_operation actor_user_id trust issue tracked (AUDIT-1)
    Delivery order role scope tracked (AUTHZ-1)
    → E1C-A1 DESIGN is UNBLOCKED

GATE 1 — P0 Remediation
├─ E1C-A1: Final SQL remediation strategy
│   ├─ Exact migration SQL for all 8 P0s
│   ├─ team_members hierarchy rules
│   ├─ cerrar_mesa_atomico: REVOKE + defense-in-depth
│   ├─ decrement_stock: DROP legacy function
│   ├─ Break-risk analysis per fix
│   └─ Rollback strategy per fix
│
├─ E1C-A2: Implement P0 migration(s)
│   ├─ Write migration file(s) — reviewed before apply
│   ├─ Manually apply via Supabase SQL Editor
│   └─ One migration preferred; split only if risk requires
│
├─ E1C-A3: Validate P0 fixes
│   ├─ Each exploit path re-tested → must fail
│   ├─ Owner/Encargado operational flows verified
│   ├─ invite-member Edge Function verified
│   ├─ Close-table via sync wrapper verified
│   ├─ Stock/caja/CRM/analytics smoke-tested
│   └─ No callers broken by decrement_stock DROP
│
│   ▼ GATE 1 PASSES → unlock Gate 2

GATE 2 — Mozo Authorization Hardening
├─ E1C-B1: Mozo RPC role gates
│   ├─ append_caja_retiro: Dueño/Encargado only
│   ├─ create_factura_contingencia: Dueño/Encargado only
│   └─ Any other mutation RPCs needing role restriction
│
├─ E1C-B2: Mozo RLS write restrictions
│   ├─ Split FOR ALL → SELECT (all) + write (Dueño/Encargado)
│   ├─ Tables: menu_items, branches, stock_items, caja_shifts,
│   │   restaurant_settings, device_tokens, staff_pins,
│   │   facturas, facturas_contingencia, stock_egresos,
│   │   stock_ingresos (write beyond insert), reservations
│   └─ Verify Mozo can: create turns, add turn_items, close tables, read menu
│
│   ▼ GATE 2 PASSES → unlock Gate 3

GATE 3 — C2 Session Bridge
├─ E1C-C: auth_user_id migration + unique index
├─ E1C-D: Adapt employee-login Edge Function
│   ├─ Validate credentials (existing)
│   ├─ Create/find passwordless auth.users
│   ├─ Upsert team_members with correct role
│   ├─ admin.generateLink({ type: 'magiclink' })
│   ├─ Return token_hash
│   └─ Frontend verifyOtp → real session
│
│   ▼ GATE 3 PASSES → unlock Gate 4

GATE 4 — Employee Login UI
├─ E1C-E: Login form, AuthContext integration, role-based sidebar
│
│   ▼ GATE 4 PASSES → unlock Gate 5

GATE 5 — Employee Management
├─ Employee CRUD UI in Configuración
├─ Role/permission assignment
├─ Password reset by admin
└─ PIN-to-employee migration tools
```

---

## 7. IMMEDIATE NEXT TASK

### E1C-A1: Final SQL Remediation Strategy for All 8 Production-Confirmed P0 Vulnerabilities

**Status:** UNBLOCKED for DESIGN. Migration writing/applying requires separate review approval.

**Objective:** Produce exact, reviewed migration SQL covering all 8 production-confirmed P0s. Strategy document only — no code application.

**Scope:**
1. P0-1: `stock_ingresos` — drop insecure permissive read/insert policies; ensure tenant-scoped policy covers all commands
2. P0-2: `get_top_products` — convert to PL/pgSQL with `user_owns_branch` guard; REVOKE from PUBLIC
3. P0-3: `get_facturacion_range` — same treatment as P0-2
4. P0-4: `increment/decrement_customer_points` — add tenant guard via `get_user_restaurant_id()`; convert to PL/pgSQL
5. P0-5: `team_members` — drop permissive FOR ALL policy; split into SELECT (all) + write (role-restricted hierarchy)
6. P0-6: `cerrar_mesa_atomico` — DROP legacy 7-arg and 9-arg overloads; REVOKE 11-arg from PUBLIC/anon/authenticated; add defense-in-depth tenant check
7. P0-7: `append_caja_retiro` — add tenant + role guard; REVOKE from PUBLIC
8. P0-8: `decrement_stock` — DROP legacy 2-param function; verify no remaining callers
9. Break-risk analysis per fix
10. Rollback SQL per fix
11. Single vs multiple migration decision

**Not in scope:** Applying migrations, Mozo RPC gates (Gate 2), C2 session bridge (Gate 3), frontend changes, AUDIT-1/AUTHZ-1/HARD-1 (Gate 2).

---

## 8. VERIFICATION CHECKLIST FOR E1C-A1

- [ ] P0-1: stock_ingresos policies use `user_owns_branch(branch_id)` for SELECT and INSERT
- [ ] P0-1: Assess whether UPDATE/DELETE policies needed
- [ ] P0-2: get_top_products converted to PL/pgSQL with `user_owns_branch` guard, signature unchanged
- [ ] P0-3: get_facturacion_range same treatment, signature unchanged
- [ ] P0-4: Both points functions add `WHERE restaurant_id = get_user_restaurant_id()`
- [ ] P0-5: team_members FOR ALL dropped; SELECT for all in restaurant
- [ ] P0-5: INSERT restricted to Dueño/Encargado
- [ ] P0-5: UPDATE — Dueño can update any; Encargado can update Mozo/Cocinero only; nobody sets rol to value implying Dueño; nobody UPDATEs owner's row
- [ ] P0-5: DELETE — same hierarchy; cannot delete Dueño-linked row
- [ ] P0-5: invite-member uses service_role — no break
- [ ] P0-6: DROP legacy 7-arg and 9-arg cerrar_mesa_atomico overloads
- [ ] P0-6: REVOKE ALL on 11-arg cerrar_mesa_atomico from PUBLIC/anon/authenticated
- [ ] P0-6: Defense-in-depth tenant check added inside 11-arg function body
- [ ] P0-6: sync_close_table_operation still calls it (internal, same definer context)
- [ ] P0-7: append_caja_retiro gets tenant + role check; REVOKE from PUBLIC
- [ ] P0-8: decrement_stock DROPped; verify no remaining callers in frontend or other RPCs
- [ ] Break-risk: close-table via sync wrapper unaffected
- [ ] Break-risk: owner analytics dashboards unaffected
- [ ] Break-risk: CRM points redemption unaffected
- [ ] Break-risk: stock flows via _with_egreso/_with_ingreso unaffected
- [ ] Break-risk: caja retiro via proper flow unaffected
- [ ] Rollback: reverse SQL documented per fix
- [ ] No scope creep: no Mozo gates, no C2 code, no frontend

---

## 9. WHAT MUST NOT BE TOUCHED YET

| File / Component | Reason |
|-----------------|--------|
| `src/lib/AuthContext.jsx` | Core auth — no changes until C2 |
| `src/lib/useUserRole.js` | Role resolution — no changes until C2 |
| `src/pages/Login.jsx` | Owner login — stable |
| `supabase/functions/employee-login/index.ts` | Deployed — next change at Gate 3 |
| `supabase/functions/staff-pin-auth/index.ts` | Deployed — stable |
| `supabase/functions/invite-member/index.ts` | Reference pattern — do not modify |
| `supabase/functions/_shared/http.ts` | Shared infrastructure — stable |
| Device mode code | Deployed, UI-only, correct |
| PWA configuration | Deployed, working |
| Any employee Login UI | Do not create until Gate 4 |
| Applied migrations (20260529000001, 20260529000002, 20260524000099, etc.) | Never modify applied migrations — fixes go in NEW files |

**Critical rules:**
- All fixes must be NEW migration files
- Migrations applied manually via Supabase Dashboard SQL Editor
- Never use `supabase db push`
- Never modify already-applied migrations

---

## 10. MANDATORY VALIDATION STANDARD

Every future implementation task report must include:

1. Exact files changed
2. Exact risk being addressed (P0-ID reference)
3. No-scope-creep confirmation
4. Tests/build results
5. Production/manual verification steps
6. Rollback strategy for migrations
7. Remaining risks explicitly not solved
8. Whether next phase is blocked or allowed

---

## CHANGE LOG

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-30 | Initial master plan. 5 P0 vulnerabilities. 4 P1s listed. |
| 1.1 | 2026-05-30 | Phase 0 status corrected (calculation ≠ authorization closure). P1 count corrected (4 not 3). 3 P1s promoted to P0 after Gate 0-B verification (cerrar_mesa_atomico, append_caja_retiro, decrement_stock). Total P0: 8. Full SECURITY DEFINER inventory added (23 functions: 16 safe, 7 vulnerable). Gate structure updated (0-A/0-B prerequisite). E1C-A1 unblocked. Document persisted to `docs/security/`. |
| 1.2 | 2026-05-30 | Critical accuracy correction: repository inspection alone does not prove production state. All P0s changed from "confirmed active" to "confirmed in repository; production corroboration pending." Added `Production corroboration` and `Production evidence` fields to each P0 entry. Added Gate 0-C (production read-only verification) as prerequisite before E1C-A1. E1C-A1 re-blocked until Gate 0-C completes. Read-only SQL verification script produced. Confirmed no sensitive values in document. |
| 1.3 | 2026-05-30 | Gate 0-C COMPLETE. All 8 P0s production-corroborated via read-only catalog queries + `has_function_privilege` effective privilege checks. P0-6 updated: three production overloads (7/9/11 args) confirmed; 7-arg bypasses discount/points validation; fix direction updated to DROP legacy overloads. P0-5 evidence updated: permissive FOR ALL policy defeats stricter write policy via OR combination. SECURITY DEFINER inventory updated with production verification status. Added tracked items: AUDIT-1 (sync_close_table actor_user_id client-asserted), AUTHZ-1 (delivery order role scope), HARD-1 (rls_auto_enable unnecessary PUBLIC execute). Employee login RPCs confirmed correctly restricted. E1C-A1 DESIGN unblocked; migration writing/applying requires separate review. |
