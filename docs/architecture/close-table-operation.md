# CLOSE_TABLE_OPERATION Contract

## Purpose

`CLOSE_TABLE_OPERATION` is the first business-operation contract for MiMenu's local-first + cloud sync architecture.

Closing a table is not a simple status update. It is a business transaction that can affect:

- table/turn state;
- payments;
- caja totals;
- tips and discounts;
- stock;
- fiscal invoicing;
- audit logs;
- reports;
- kitchen/salon device state;
- offline sync state.

The goal is to make table closing safe online, safe offline, retryable, idempotent, and traceable.

## Current Code Reality

Current relevant files:

- `src/components/salon/ComandaPanel.jsx`
- `src/lib/cajaService.js`
- `src/lib/offlineQueue.js`
- `src/lib/offlineSync.js`
- `src/lib/stockApi.js`
- `src/lib/store.jsx`
- `supabase/migrations/*cerrar_mesa_atomico*`

Current behavior:

- Online close calls `cerrarMesaOnline`.
- Modern operation close calls `sync_close_table_operation`, which records the
  business operation and applies stock movements server-side when the stock
  effects migration is installed.
- Legacy close still falls back to `cerrar_mesa_atomico` and client-side stock
  decrement.
- Offline close enqueues a small `CLOSE_TABLE` operation.
- Offline UI marks the table as `pendiente_cobro`.
- Sync later calls `sync_close_table_operation` when available, with fallback to
  `cerrar_mesa_atomico`.

This is a good base. The next gap is adding fiscal/payment recovery effects to
the same operation model instead of handling them as separate UI flows.

## Design Principle

A close-table operation must contain enough data to reproduce the business decision later, even if:

- the device was offline;
- the menu changed after the close;
- recipes changed after the close;
- the caja changed after the close;
- the user retries sync;
- another device touched the same table;
- the server partially processed a previous attempt.

## Operation Shape

Initial canonical shape:

```ts
type CloseTableOperation = {
  operation_id: string;
  operation_type: 'CLOSE_TABLE';
  operation_version: 1;

  tenant: {
    restaurant_id: string;
    branch_id: string;
  };

  device: {
    device_id: string;
    device_name?: string;
    local_sequence?: number;
    app_version?: string;
  };

  actor: {
    user_id?: string;
    staff_pin_id?: string;
    staff_name?: string;
    role?: string;
  };

  table: {
    local_table_id: number | string;
    mesa_num: number;
    turn_id: string | null;
    opened_at?: string | number | null;
    mozo?: string;
  };

  caja: {
    caja_shift_id: string | null;
  };

  items_snapshot: Array<{
    line_id?: string;
    turn_item_id?: string | null;
    menu_item_id?: string | null;
    name: string;
    qty: number;
    unit_price: number;
    note?: string;
    modifiers?: unknown[];
    is_free_item?: boolean;
  }>;

  pricing: {
    subtotal: number;
    discount_amount: number;
    discount_reason?: string | null;
    tip_amount: number;
    total_charged: number;
  };

  payment: {
    method: string;
    payments_detail?: Array<{
      method: string;
      amount: number;
      provider?: 'manual' | 'mercadopago' | 'other';
      provider_reference?: string | null;
    }> | null;
    offline_payment: boolean;
    provider_status?: 'not_required' | 'pending_online' | 'approved' | 'failed' | 'unknown';
  };

  stock_intent: {
    mode: 'derive_from_current_recipes' | 'snapshot';
    recipe_snapshot?: Array<{
      menu_item_id: string;
      stock_item_id: string;
      qty_per_unit: number;
      total_qty: number;
      unit?: string;
    }>;
  };

  fiscal_intent: {
    required: boolean;
    status: 'not_requested' | 'pending_online' | 'issued' | 'failed' | 'contingency_required';
    document_type?: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | null;
    customer_snapshot?: unknown;
  };

  timestamps: {
    created_at_local: string;
    business_date?: string;
    timezone: string;
  };

  sync: {
    status: 'local_applied' | 'pending_sync' | 'syncing' | 'synced' | 'failed' | 'conflict';
    attempts: number;
    last_error?: string | null;
  };
};
```

## Required Invariants

- `operation_id` is globally unique and stable across retries.
- `operation_id` is the idempotency key.
- `branch_id` must belong to `restaurant_id`.
- `turn_id` must belong to the same branch if present.
- `caja_shift_id` must belong to the same branch if present.
- `total_charged` must equal the sum of payment details when payment details are present.
- The operation must be stored locally before the UI marks the table as closed/pending.
- Retrying the same operation must not duplicate caja totals, stock movements, fiscal records, or audit logs.

## Local Application Rules

When offline and the user closes a table:

1. Build the full operation.
2. Save it to local durable storage.
3. Mark the table as `pendiente_cobro`.
4. Update local caja view as pending/estimated.
5. Optionally update local stock view as pending/estimated.
6. Print local receipt/pre-ticket if configured.
7. Show clear pending-sync UI.

Do not claim cloud sync, fiscal issuance, or MercadoPago approval if those did not happen.

## Server Processing Rules

When the server receives a `CLOSE_TABLE_OPERATION`:

1. Authenticate the user/session or trusted device sync identity.
2. Validate request schema.
3. Verify tenant, branch, turn, and caja ownership.
4. Check whether `operation_id` was already processed.
5. If already processed, return the previous result.
6. Lock affected turn/caja rows.
7. Verify the turn is still closable.
8. Apply turn close.
9. Apply caja totals.
10. Apply stock movements.
11. Create audit log.
12. Create fiscal pending/contingency record if needed.
13. Mark operation as processed.
14. Return a stable operation result.

## Derived Effects

The operation may produce:

- `turns` update;
- `caja_shifts` update;
- `stock_egresos` inserts;
- `facturas` insert;
- `facturas_contingencia` insert;
- `audit_logs` insert;
- `business_events` insert in future;
- realtime notifications.

These effects must be tied back to `operation_id` wherever possible.

## Conflict Cases

### Table already closed

If the same `operation_id` already closed it:

- return success/idempotent replay.

If another operation closed it:

- return conflict;
- preserve local operation;
- do not silently discard;
- show support/review state.

### Caja shift closed before sync

Possible resolutions:

- attach to original caja if allowed;
- create adjustment record;
- require manager review.

This must not silently add totals to a different caja.

### Stock recipe changed after offline close

Preferred rule:

- use `recipe_snapshot` when available.

Fallback rule:

- derive from current recipes, but mark stock effect as derived-at-sync-time.

### Fiscal issuance unavailable

If offline:

- create pending fiscal intent.

If provider fails:

- create failed/contingency record.

Never lose the fiscal obligation.

### Payment provider unavailable

Manual/cash payments can be recorded offline.

MercadoPago terminal payments cannot be assumed approved offline unless the provider flow explicitly supports it and returns a verifiable approval.

## Compatibility With Current System

Do not replace current `CLOSE_TABLE` queue processing immediately.

Migration path:

1. Add a builder that creates the canonical operation object.
2. Store the canonical object inside the existing IndexedDB queue item.
3. Keep old top-level fields temporarily for `offlineSync.js` compatibility.
4. Teach `offlineSync.js` to prefer `op.operation` when present.
5. Later introduce a server-side `sync-operation` endpoint.
6. Later persist operations in Supabase.
7. Later route online close through the same operation path.

This keeps current behavior working while moving toward the target model.

## Minimal First Implementation

The first safe code step should only:

- create a helper such as `buildCloseTableOperation`;
- include operation object in offline queue payload;
- preserve current offline processing fields;
- add no database migration yet;
- add tests for operation shape if practical.

Suggested files:

- `src/lib/operations/closeTableOperation.js`
- `src/components/salon/ComandaPanel.jsx`
- possibly `src/lib/offlineSync.js` only if needed for reading the nested operation later.

## Verification Plan

Minimum verification for first implementation:

- Close table online still works.
- Close table offline still enqueues and marks `pendiente_cobro`.
- Existing `offlineSync.js` can still process old and new queue items.
- Queue item contains canonical `operation`.
- No duplicated stock/caja/fiscal behavior is introduced.
- No behavior changes for payment modal.

## Open Decisions

- Final local runtime: PWA, Tauri, Electron, or PWA + local agent.
- Whether operation storage remains IndexedDB or moves to SQLite for local install.
- Whether sync identity is user-session based, device-token based, or both.
- Whether fiscal pending records are created locally, server-side, or both.
- Whether stock recipe snapshots should be required for every close.
