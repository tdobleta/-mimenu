# MIMENU MASTER PLAN — SECURITY, ARCHITECTURE & RELEASE READINESS

**Version:** 1.4 — 2026-05-30
**Status:** ACTIVE — Employee UI blocked on P0 closure
**Gate:** Patch A APPLIED AND VERIFIED IN PRODUCTION (2026-05-30). Patch B internal authorization: DESIGN IN PROGRESS — NOT AUTHORIZED FOR MIGRATION WRITING. Patch C points financial integrity: REQUIRED — DESIGN NOT FINALIZED. Employee Login/C2 remain blocked.

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

**Current deployment:** Branch `main` at commit `c1152947`. Working tree clean. All employee login migrations applied in production. Patch A privilege containment migration applied and verified in production (2026-05-30). No employee Login UI exists in the frontend.

---

## 2. COMPLETED & PRODUCTION-VALIDATED CAPABILITIES

### Phase 0 — Financial Calculation Integrity (deployed, authorization pending)

| Commit | Capability | Calculation Status | Authorization Status |
|--------|-----------|-------------------|---------------------|
| `b1ebbb5c` | Server-side discount validation in `cerrar_mesa_atomico` | CLOSED | PARTIALLY CONTAINED — Patch A blocks anon/PUBLIC; cross-tenant by authenticated remains open until Patch B |
| `994e6d30` | Duplicate close-table prevention (FOR UPDATE + status check) | CLOSED | PARTIALLY CONTAINED — same as above |
| `d03515d3` | Close-table details shown in caja activity | CLOSED | N/A (read-only UI) |
| `6ac17dc2` | Server-side points redemption validation | CLOSED | PARTIALLY CONTAINED — Patch A blocks anon/PUBLIC; cross-tenant + client-trust earning remain open until Patch B/C |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** Insecure `stock_ingresos_read` and `stock_ingresos_insert` policies dropped. Only `stock_ingresos_branch` (FOR ALL, tenant-scoped) remains. Cross-tenant access for authenticated users is now blocked by tenant-scoped policy. |
| **Remaining** | Same-tenant role hardening (UPDATE/DELETE restriction by role) is a product decision outside Patch A. |
| **Closure** | Patch A containment CLOSED for cross-tenant. Full role-hardening deferred to product review. |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon. GRANT to authenticated + service_role. `has_function_privilege('anon', ...) = false` confirmed. |
| **Remaining** | Function body still lacks tenant guard — authenticated cross-tenant call succeeds. Requires Patch B. |
| **Closure** | Anon containment CLOSED. Cross-tenant closure requires Patch B (tenant guard in function body). |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon. GRANT to authenticated + service_role. `has_function_privilege('anon', ...) = false` confirmed. Zero callers in application code. |
| **Remaining** | Function body still lacks tenant guard. Requires Patch B. |
| **Closure** | Anon containment CLOSED. Cross-tenant closure requires Patch B. |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon. GRANT to authenticated + service_role (temporary compatibility allowance). `has_function_privilege('anon', ...) = false` confirmed for both. |
| **Remaining** | Function bodies lack tenant/role/input guards (Patch B). Points earning remains client-trusted — financial integrity NOT closed (Patch C). |
| **Closure** | Anon containment CLOSED. Cross-tenant + financial integrity closure requires Patch B + C. |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE ALL from anon. REVOKE INSERT/UPDATE/DELETE from authenticated (SELECT retained). Dropped `team_members_restaurant` FOR ALL policy. Created `team_members_select` (SELECT only, tenant-scoped). Verified: anon SELECT/INSERT/UPDATE/DELETE = false. authenticated SELECT = true, INSERT/UPDATE/DELETE = false. service_role full CRUD retained. |
| **Remaining** | Audit of `invite-member` Edge Function hierarchy checks as sole mutation boundary (Patch B). Encargado->Dueno escalation prevention verified in Edge Function but not yet formally audited. |
| **Closure** | Browser-side mutation containment CLOSED. Full P0-5 closure requires invite-member hierarchy audit (Patch B). |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon on all three overloads. 11-arg: GRANT to authenticated + service_role. 7-arg and 9-arg: NOT granted to any role (no verified caller). Verified: anon = false for all. authenticated 7-arg = false, 9-arg = false, 11-arg = true. |
| **Remaining** | Function body lacks tenant guard and p_caja_shift_id branch validation (Patch B). Effective caja_shift_id must validate COALESCE(p_caja_shift_id, v_turn.caja_shift_id). Legacy 7/9-arg overloads still exist but are unreachable. DROP in Patch B. |
| **Closure** | Anon + legacy-overload containment CLOSED. Cross-tenant + p_caja_shift_id closure requires Patch B. |

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
| **Production evidence** | SECURITY DEFINER active; updates `caja_shifts.retiros` from caller-supplied `p_shift_id`/`p_retiro_json` with no tenant or role validation. `has_function_privilege` confirms anon=true, authenticated=true. NULL ACL (PUBLIC default). Production column type confirmed: `caja_shifts.retiros` is TEXT with default `'[]'::text`. |
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon. GRANT to authenticated + service_role. `has_function_privilege('anon', ...) = false` confirmed. |
| **Remaining** | Function body lacks tenant guard and role enforcement (Dueno/Encargado only). Requires Patch B. TEXT storage preserved — safe jsonb round-trip pattern unchanged. |
| **Closure** | Anon containment CLOSED. Cross-tenant + role-gate closure requires Patch B. |

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
| **Patch A status** | **APPLIED AND VERIFIED 2026-05-30.** REVOKE from PUBLIC/anon. GRANT to authenticated + service_role. `has_function_privilege('anon', ...) = false` confirmed. |
| **Remaining** | Function body lacks tenant guard, role enforcement (Dueno/Encargado only), and non-positive value rejection. Requires Patch B. |
| **Closure** | Anon containment CLOSED. Cross-tenant + role-gate closure requires Patch B. |

---

### SECURITY DEFINER Inventory Summary (production-verified 2026-05-30)

| Classification | Count | Functions | Verification |
|---------------|-------|-----------|-------------|
| **SAFE — has tenant/role validation** | 13 | `get_user_restaurant_id`, `get_user_role`, `user_owns_branch`, `sync_close_table_operation`, `apply_sales_operation`, `close_caja_shift_operation`, `open_caja_shift_operation`, `archive_customer_operation`, `create_factura_contingencia`, `create_delivery_order_operation`, `update_delivery_order_operation`, `decrement_stock_with_egreso`, `increment_stock_with_ingreso` | Part C supplemental query confirmed tenant/role guards in function bodies |
| **SAFE — service_role only** | 3 | `check_employee_login_lockout`, `record_employee_login_failure`, `clear_employee_login_attempts` | `has_function_privilege` confirmed anon=false, authenticated=false, service_role=true. Earlier Block 8 `execute_access_summary` was misleading for explicit ACLs; corrected via effective privilege checks. |
| **SAFE — utility (event trigger)** | 1 | `rls_auto_enable` | Event trigger function that enables RLS on new public tables. Does not disable RLS, modify policies, or touch user data. Track as HARD-1 for unnecessary PUBLIC execute privilege. |
| **PATCH A CONTAINED (P0)** | 7 functions (10 overloads) | `cerrar_mesa_atomico` (3 overloads: 7/9/11 args), `append_caja_retiro`, `decrement_stock`, `increment_customer_points`, `decrement_customer_points`, `get_top_products`, `get_facturacion_range` | Patch A applied 2026-05-30: anon EXECUTE revoked on all. 7/9-arg cerrar_mesa_atomico denied to all roles. Remaining: function bodies lack internal tenant/role guards (Patch B/C required). |

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

E1C-A1 — Remediation design
    Patch A containment strategy: ✅ COMPLETE (R3 FINAL approved, applied in production)
    Patch B internal authorization: DESIGN IN PROGRESS — NOT AUTHORIZED FOR MIGRATION WRITING
    Patch C points financial integrity: DESIGN NOT FINALIZED
    Three-patch strategy identified: Patch A (containment) → B (internal auth) → C (points earning)
    team_members write architecture confirmed (no browser writes, Edge Function only)
    cerrar_mesa_atomico p_caja_shift_id subvector identified
    Helper function compatibility verified (get_user_role returns 'Dueno' for owner)

PATCH A — Emergency privilege containment ✅ APPLIED AND VERIFIED (v1.4)
    Commit: c1152947 — applied to production 2026-05-30
    Verification: docs/security/PATCH_A_VERIFICATION.sql — all blocks passed
    Results:
      anon EXECUTE = false for all 9 P0 RPC signatures
      cerrar_mesa_atomico 7/9-arg: authenticated = false, service_role = false
      cerrar_mesa_atomico 11-arg: authenticated = true, service_role = true
      stock_ingresos: insecure policies removed, only tenant-scoped remains
      team_members: anon all false, authenticated SELECT-only, service_role CRUD
      team_members: only tenant-scoped SELECT policy remains
    → Patch B/C design work IN PROGRESS. Migration writing NOT authorized.

GATE 1 — P0 Full Remediation (Patch B + C)
├─ Patch B: Internal tenant/role authorization (DESIGN IN PROGRESS — NOT AUTHORIZED FOR MIGRATION WRITING)
│   │
│   │  BLOCKERS (all must be resolved before migration writing is authorized):
│   ├─ cerrar_mesa_atomico: validate COALESCE(p_caja_shift_id, v_turn.caja_shift_id) — effective shift must belong to same branch/tenant
│   ├─ FIN-2: determine whether closed caja shifts may ever be mutated by late offline table closes
│   ├─ append_caja_retiro: tenant guard via branch→restaurant + role enforcement (Dueno/Encargado only)
│   ├─ decrement_stock: tenant guard + role enforcement (Dueno/Encargado) + non-positive value rejection + trusted-origin evaluation
│   ├─ get_top_products / get_facturacion_range: tenant guards (user_owns_branch) inside function bodies
│   ├─ increment/decrement_customer_points: tenant guard + role check + non-positive value rejection
│   ├─ invite-member Edge Function: formal hierarchy audit (Encargado→Dueno escalation, self-promotion, Dueno modification/deletion vectors)
│   ├─ cerrar_mesa_atomico: p_caja_shift_id branch validation for supplied value
│   ├─ DROP legacy 7/9-arg cerrar_mesa_atomico overloads (no verified callers)
│   └─ REVOKE INSERT/UPDATE/DELETE grants from authenticated on team_members (defense-in-depth)
│
├─ Patch C: Server-side points earning (REQUIRED BEFORE EMPLOYEE ACCESS — DESIGN NOT FINALIZED)
│   │
│   │  BLOCKERS (all must be resolved before design is finalized):
│   ├─ Server-truth earned points: compute inside cerrar_mesa_atomico from server-verified final total
│   ├─ p_cliente_id payload path: determine how customer identity reaches cerrar_mesa_atomico for earning
│   ├─ Double-earning prevention: ensure re-close or offline replay cannot award points twice
│   ├─ Standalone RPC restriction/removal: restrict increment_customer_points to service_role or DROP
│   ├─ crmApi.js deployment coordination: frontend must stop calling increment_customer_points before/with migration
│   └─ Validate customer existence even without redemption (prevent orphan points)
│
├─ E1C-A3: Validate Patch B + C fixes
│   ├─ Each exploit path re-tested → must fail
│   ├─ Owner/Encargado operational flows verified
│   ├─ invite-member Edge Function verified
│   ├─ Close-table via sync wrapper verified
│   ├─ Stock/caja/CRM/analytics smoke-tested
│   └─ Points earning via table close verified (no client RPC)
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

### Patch B Migration Writing — Internal Tenant/Role Authorization

**Status:** DESIGN IN PROGRESS. Patch A containment strategy from R3 is applied. Patch B internal authorization design is NOT finalized. Migration writing NOT authorized — requires explicit approval after design completion.

**Prerequisite completed:** Patch A applied and verified in production (2026-05-30).

**Objective:** Write migration file `20260530000002_patch_b_internal_authorization.sql` implementing tenant guards, role enforcement, input validation, and legacy overload cleanup inside all P0 function bodies.

**Scope (from E1C-A1-R3 design — Patch B items, design in progress):**
1. P0-2: `get_top_products` — convert to plpgsql, add `user_owns_branch(p_branch_id)` guard
2. P0-3: `get_facturacion_range` — same treatment as P0-2
3. P0-4: `increment/decrement_customer_points` — tenant guard, role check (Dueno/Encargado/Mozo), non-positive value rejection
4. P0-5: `team_members` — REVOKE INSERT/UPDATE/DELETE grants from authenticated (defense-in-depth); audit invite-member hierarchy
5. P0-6: `cerrar_mesa_atomico` — rewrite 11-arg with tenant guard from locked turn, p_caja_shift_id branch validation, COALESCE handling; DROP 7/9-arg overloads
6. P0-7: `append_caja_retiro` — tenant guard, role enforcement (Dueno/Encargado only), TEXT-safe handling
7. P0-8: `decrement_stock` — tenant guard, role enforcement (Dueno/Encargado only), non-positive value rejection

**Separately tracked:** Patch C (server-side points earning) — design NOT finalized. Requires both migration and frontend code change (crmApi.js deployment coordination).

**Not in scope:** Applying migrations, Mozo RPC gates (Gate 2), C2 session bridge (Gate 3), frontend changes beyond Patch C, AUDIT-1/AUTHZ-1/HARD-1 (Gate 2).

---

## 8. VERIFICATION CHECKLISTS

### Patch A — Emergency Privilege Containment ✅ ALL PASSED (2026-05-30)

- [x] anon EXECUTE = false for all 9 P0 RPC signatures
- [x] cerrar_mesa_atomico 7/9-arg: authenticated = false, service_role = false
- [x] cerrar_mesa_atomico 11-arg: authenticated = true, service_role = true
- [x] Operational RPCs (get_top_products, get_facturacion_range, points, retiro, stock): authenticated + service_role = true
- [x] stock_ingresos: insecure `stock_ingresos_read` and `stock_ingresos_insert` policies removed
- [x] stock_ingresos: only `stock_ingresos_branch` (FOR ALL, tenant-scoped) remains
- [x] team_members: anon SELECT/INSERT/UPDATE/DELETE = false
- [x] team_members: authenticated SELECT = true, INSERT/UPDATE/DELETE = false
- [x] team_members: service_role full CRUD retained
- [x] team_members: only `team_members_select` policy (tenant-scoped SELECT) remains
- [x] No accidental GRANT to PUBLIC or anon in migration
- [x] All tests pass (485/485), build succeeds
- [x] Verification script: docs/security/PATCH_A_VERIFICATION.sql — all blocks passed

### Patch B — Internal Authorization (PENDING)

- [ ] P0-2: get_top_products tenant guard in function body
- [ ] P0-3: get_facturacion_range tenant guard in function body
- [ ] P0-4: increment/decrement_customer_points tenant + role + input guards
- [ ] P0-5: REVOKE INSERT/UPDATE/DELETE grants from authenticated (defense-in-depth)
- [ ] P0-5: invite-member hierarchy formally audited
- [ ] P0-6: cerrar_mesa_atomico 11-arg rewrite with tenant + p_caja_shift_id validation
- [ ] P0-6: DROP legacy 7/9-arg overloads
- [ ] P0-7: append_caja_retiro tenant + role guard
- [ ] P0-8: decrement_stock tenant + role + input guard
- [ ] Break-risk: all operational flows verified post-apply
- [ ] Rollback SQL documented

### Patch C — Server-Side Points Earning (PENDING)

- [ ] Points earning computed inside cerrar_mesa_atomico from server-truth total
- [ ] increment_customer_points restricted to service_role only
- [ ] crmApi.js no longer calls increment_customer_points
- [ ] No double-earning on table close
- [ ] Close table without customer: no points logic triggered

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
| Applied migrations (20260529000001, 20260529000002, 20260524000099, 20260530000001, etc.) | Never modify applied migrations — fixes go in NEW files |

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
| 1.4 | 2026-05-30 | **Patch A APPLIED AND VERIFIED IN PRODUCTION.** Commit `c1152947`. Patch A containment strategy from E1C-A1-R3 applied. Three-patch strategy (A→B→C) identified. Patch A emergency containment applied: REVOKE PUBLIC/anon on all 9 P0 RPC signatures; cerrar_mesa_atomico 7/9-arg denied to all roles; stock_ingresos insecure policies removed; team_members browser-write access removed (SELECT-only for authenticated, service_role retains CRUD via invite-member Edge Function). Production verification passed all blocks in PATCH_A_VERIFICATION.sql. P0s remain open for authenticated cross-tenant exploitation (Patch B) and client-trusted points earning (Patch C). Patch B design IN PROGRESS — not authorized for migration writing. Patch C design NOT FINALIZED. Employee Login/C2 remain blocked. |
