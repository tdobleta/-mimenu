import * as Sentry from '@sentry/react';

function clean(value) {
  if (value === null || value === undefined || value === '') return 'none';
  return String(value);
}

export function buildObservabilityContext({
  user = null,
  store = {},
  route = '',
  online = true,
} = {}) {
  const activeBranchId = store.branchId && store.branchId !== 'todas'
    ? store.branchId
    : store.sucursales?.[0]?.id || null;

  return {
    user: user?.id ? { id: user.id } : null,
    tags: {
      restaurant_id: clean(store.restaurantId),
      branch_id: clean(activeBranchId),
      role: clean(store.userRole || store.role),
      route: clean(route),
      online: online ? 'true' : 'false',
    },
    context: {
      restaurant_loaded: Boolean(store.restaurantId),
      active_branch_id: activeBranchId,
      branches_count: Array.isArray(store.sucursales) ? store.sucursales.length : 0,
      caja_shift_open: Boolean(store.turnoActivo?.id),
      caja_shift_branch_id: store.turnoActivo?.branch_id || null,
      offline_mode: Boolean(store.isOfflineMode),
    },
  };
}

export function applyObservabilityContext(context) {
  if (!context) return;
  try {
    if (context.user) Sentry.setUser(context.user);
    else Sentry.setUser(null);
    Object.entries(context.tags || {}).forEach(([key, value]) => {
      Sentry.setTag(key, value);
    });
    Sentry.setContext('mimenu_operational_context', context.context || {});
  } catch {
    // Observability must never break POS operation.
  }
}

export function captureOperationalEvent(message, data = {}) {
  try {
    Sentry.addBreadcrumb({
      category: 'mimenu.operation',
      level: data.level || 'info',
      message,
      data: sanitizeBreadcrumbData(data),
    });
  } catch {}
}

export function captureOperationalError(error, data = {}) {
  try {
    Sentry.captureException(error, {
      tags: sanitizeBreadcrumbData(data.tags || {}),
      contexts: {
        mimenu_error_context: sanitizeBreadcrumbData(data.context || {}),
      },
    });
  } catch {}
}

export function sanitizeBreadcrumbData(data = {}) {
  const blocked = new Set([
    'email',
    'password',
    'pin',
    'token',
    'accessToken',
    'access_token',
    'refresh_token',
    'apikey',
    'apiKey',
    'secret',
    'authorization',
    'mp_access_token',
    'tusfacturas_apitoken',
    'tusfacturas_usertoken',
    'tusfacturas_tokenclient',
  ]);

  return Object.entries(data).reduce((acc, [key, value]) => {
    if (blocked.has(key)) return acc;
    if (value && typeof value === 'object') {
      acc[key] = '[object]';
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
}
