const STATUS_WEIGHT = { ok: 1, warning: 0.55, critical: 0 };

export const REQUIRED_EDGE_FUNCTIONS = [
  'health',
  'chat',
  'invite-member',
  'staff-pin-auth',
  'mp-settings',
  'mp-payment-intent',
  'mp-payment-status',
  'afip-settings',
  'facturar',
  'send-receipt',
  'crm-email',
  'cocina-feed',
  'cocina-update',
];

export const REQUIRED_TABLES = [
  'business_operations',
  'audit_logs',
  'restaurant_settings',
  'staff_pins',
  'device_tokens',
  'facturas',
  'facturas_contingencia',
  'customers',
  'customer_visits',
  'stock_ingresos',
];

function check(id, area, label, status, detail, action = '') {
  return { id, area, label, status, detail, action };
}

function has(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function countByStatus(checks, status) {
  return checks.filter(c => c.status === status).length;
}

function normalizeSourceScan(scan = {}) {
  return {
    frontendAnthropicKey: Boolean(scan.frontendAnthropicKey),
    directAnthropicBrowserCall: Boolean(scan.directAnthropicBrowserCall),
    hardcodedSentryDsn: Boolean(scan.hardcodedSentryDsn),
    trackedEnvLocal: Boolean(scan.trackedEnvLocal),
    obsoleteSnapshotsTracked: Boolean(scan.obsoleteSnapshotsTracked),
  };
}

export function buildProductionAuditReport({
  env = {},
  sourceScan = {},
  health = {},
  tables = {},
  functions = {},
  deployment = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const scan = normalizeSourceScan(sourceScan);
  const tableMissing = REQUIRED_TABLES.filter(name => tables[name]?.ok !== true);
  const functionMissing = REQUIRED_EDGE_FUNCTIONS.filter(name => functions[name]?.ok !== true);
  const healthChecks = health.checks || {};
  const serviceRoleHealth = healthChecks.service_role_key;
  const dbHealth = healthChecks.database;
  const resendHealth = healthChecks.resend_api_key;

  const checks = [
    check(
      'env_supabase_url',
      'platform',
      'Supabase URL publica',
      has(env.VITE_SUPABASE_URL) ? 'ok' : 'critical',
      has(env.VITE_SUPABASE_URL) ? 'VITE_SUPABASE_URL esta configurada.' : 'Falta VITE_SUPABASE_URL en el ambiente frontend.',
      'Configurar VITE_SUPABASE_URL en el hosting.'
    ),
    check(
      'env_supabase_anon',
      'platform',
      'Supabase anon key publica',
      has(env.VITE_SUPABASE_ANON_KEY) ? 'ok' : 'critical',
      has(env.VITE_SUPABASE_ANON_KEY) ? 'VITE_SUPABASE_ANON_KEY esta configurada.' : 'Falta VITE_SUPABASE_ANON_KEY en el ambiente frontend.',
      'Configurar VITE_SUPABASE_ANON_KEY en el hosting.'
    ),
    check(
      'env_sentry_dsn',
      'observability',
      'Sentry frontend',
      has(env.VITE_SENTRY_DSN) ? 'ok' : 'warning',
      has(env.VITE_SENTRY_DSN) ? 'VITE_SENTRY_DSN esta configurada.' : 'Sentry queda desactivado porque falta VITE_SENTRY_DSN.',
      'Cargar VITE_SENTRY_DSN en Netlify y redeployar.'
    ),
    check(
      'source_no_browser_anthropic',
      'security',
      'Anthropic fuera del navegador',
      scan.frontendAnthropicKey || scan.directAnthropicBrowserCall ? 'critical' : 'ok',
      scan.frontendAnthropicKey || scan.directAnthropicBrowserCall
        ? 'El frontend contiene una credencial o llamada directa a Anthropic.'
        : 'El frontend no expone Anthropic; el chatbot usa Edge Function.',
      'Mover cualquier llamada/secret de IA a Supabase Edge Functions.'
    ),
    check(
      'source_no_hardcoded_sentry',
      'security',
      'Sentry sin hardcode por ambiente',
      scan.hardcodedSentryDsn ? 'critical' : 'ok',
      scan.hardcodedSentryDsn ? 'Hay un DSN literal de Sentry en el codigo.' : 'Sentry se configura por variable de entorno.',
      'Usar VITE_SENTRY_DSN y borrar DSNs literales.'
    ),
    check(
      'source_no_tracked_env',
      'security',
      'Env local fuera de git',
      scan.trackedEnvLocal ? 'critical' : 'ok',
      scan.trackedEnvLocal ? '.env.local sigue trackeado.' : '.env.local no forma parte del repo.',
      'Sacar .env.local del indice y rotar cualquier secret expuesto.'
    ),
    check(
      'source_no_obsolete_snapshots',
      'security',
      'Sin snapshots viejos trackeados',
      scan.obsoleteSnapshotsTracked ? 'warning' : 'ok',
      scan.obsoleteSnapshotsTracked ? 'Hay copias viejas del codigo dentro del repo.' : 'No hay snapshots viejos trackeados.',
      'Eliminar snapshots/copies obsoletas o moverlas fuera del repo.'
    ),
    check(
      'health_function',
      'backend',
      'Health check backend',
      health.ok === true ? 'ok' : 'critical',
      health.ok === true ? 'Health function responde OK.' : `Health function no esta OK${health.error ? `: ${health.error}` : '.'}`,
      'Desplegar/validar supabase functions deploy health y secrets base.'
    ),
    check(
      'health_database',
      'backend',
      'Conexion DB desde backend',
      dbHealth?.ok === true ? 'ok' : 'critical',
      dbHealth?.ok === true ? 'El backend conecta contra la DB.' : 'La health function no pudo confirmar conexion DB.',
      'Revisar SUPABASE_SERVICE_ROLE_KEY y conectividad.'
    ),
    check(
      'health_service_role',
      'backend',
      'Service role en funciones',
      serviceRoleHealth?.ok === true ? 'ok' : 'critical',
      serviceRoleHealth?.ok === true ? 'SUPABASE_SERVICE_ROLE_KEY esta presente en funciones.' : 'Falta SUPABASE_SERVICE_ROLE_KEY en Edge Functions.',
      'Configurar SUPABASE_SERVICE_ROLE_KEY como secret de Supabase Functions.'
    ),
    check(
      'health_resend',
      'integrations',
      'Resend para emails',
      resendHealth?.ok === true ? 'ok' : 'warning',
      resendHealth?.ok === true ? 'RESEND_API_KEY esta configurada.' : 'RESEND_API_KEY no esta confirmado; recibos/invitaciones pueden fallar.',
      'Configurar RESEND_API_KEY si se enviaran emails.'
    ),
    check(
      'schema_required_tables',
      'backend',
      'Tablas criticas desplegadas',
      tableMissing.length === 0 ? 'ok' : 'critical',
      tableMissing.length === 0 ? `${REQUIRED_TABLES.length} tablas criticas respondieron.` : `Faltan o fallan tablas: ${tableMissing.join(', ')}.`,
      'Aplicar migraciones master/business/stock y verificar RLS.'
    ),
    check(
      'edge_required_functions',
      'backend',
      'Edge Functions esperadas',
      functionMissing.length === 0 ? 'ok' : 'warning',
      functionMissing.length === 0 ? `${REQUIRED_EDGE_FUNCTIONS.length} funciones esperadas estan presentes localmente.` : `No se confirmaron funciones: ${functionMissing.join(', ')}.`,
      'Desplegar funciones faltantes antes de habilitar el modulo correspondiente.'
    ),
    check(
      'deployment_sentry_netlify',
      'deployment',
      'Sentry cargado en hosting',
      deployment.sentryConfigured === true ? 'ok' : 'warning',
      deployment.sentryConfigured === true ? 'El ambiente actual tiene DSN de Sentry.' : 'No se pudo confirmar VITE_SENTRY_DSN en el ambiente actual.',
      'Cargar VITE_SENTRY_DSN en Netlify y redeployar.'
    ),
  ];

  const critical = countByStatus(checks, 'critical');
  const warning = countByStatus(checks, 'warning');
  const ok = countByStatus(checks, 'ok');
  const score = Math.round((checks.reduce((sum, item) => sum + STATUS_WEIGHT[item.status], 0) / checks.length) * 100);
  const status = critical > 0 ? 'blocked' : warning > 0 ? 'ready_with_warnings' : 'ready';

  return {
    generated_at: generatedAt,
    status,
    score,
    critical,
    warning,
    ok,
    total: checks.length,
    checks,
    missing_tables: tableMissing,
    missing_functions: functionMissing,
  };
}

export function buildProductionAuditExport(report, {
  appUrl = '',
  supabaseUrl = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  let supabaseProject = '';
  try {
    supabaseProject = supabaseUrl ? new URL(supabaseUrl).hostname : '';
  } catch {
    supabaseProject = '';
  }

  return {
    generated_at: generatedAt,
    app_url: appUrl,
    supabase_project: supabaseProject,
    summary: {
      status: report?.status || 'unknown',
      score: Number(report?.score || 0),
      critical: Number(report?.critical || 0),
      warning: Number(report?.warning || 0),
      ok: Number(report?.ok || 0),
      total: Number(report?.total || 0),
    },
    checks: (report?.checks || []).map(item => ({
      id: item.id,
      area: item.area,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action || '',
    })),
    missing_tables: report?.missing_tables || [],
    missing_functions: report?.missing_functions || [],
  };
}
