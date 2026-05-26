function bool(value) {
  return Boolean(value);
}

function makeCheck(id, label, status, detail, action = '') {
  return { id, label, status, detail, action };
}

export function buildJornadaAuditReport({
  sucursales = [],
  activeBranchId = null,
  tables = [],
  menuItems = [],
  turnoActivo = null,
  teamMembers = [],
  stockItems = [],
  staffPinsCount = 0,
  kitchenDevicesCount = 0,
  mp = {},
  afip = {},
  offline = {},
  isOnline = true,
} = {}) {
  const branch = sucursales.find(s => s.id === activeBranchId) || sucursales[0] || null;
  const mesasConfiguradas = Number(branch?.mesas || tables.length || 0);
  const lowStock = stockItems.filter(item => Number(item.actual || 0) < Number(item.minimo || 0));
  const activeQueue = Number(offline.active || 0);
  const failedQueue = Number(offline.failed || 0);

  const checks = [
    makeCheck(
      'branch',
      'Sucursal operativa',
      branch ? 'ok' : 'critical',
      branch ? `Sucursal activa: ${branch.nombre || branch.id}` : 'No hay sucursal cargada.',
      'Configura al menos una sucursal.'
    ),
    makeCheck(
      'tables',
      'Mesas configuradas',
      mesasConfiguradas > 0 ? 'ok' : 'critical',
      mesasConfiguradas > 0 ? `${mesasConfiguradas} mesas disponibles.` : 'No hay mesas configuradas.',
      'Carga la cantidad de mesas de la sucursal.'
    ),
    makeCheck(
      'cash_shift',
      'Turno de caja',
      turnoActivo?.id ? 'ok' : 'critical',
      turnoActivo?.id ? 'Hay un turno de caja abierto.' : 'No hay turno de caja abierto.',
      'Abre caja antes de tomar pedidos.'
    ),
    makeCheck(
      'menu',
      'Menu de venta',
      menuItems.length > 0 ? 'ok' : 'critical',
      menuItems.length > 0 ? `${menuItems.length} productos cargados.` : 'No hay productos cargados para vender.',
      'Carga productos del menu.'
    ),
    makeCheck(
      'staff_pins',
      'Mozos y PINs',
      staffPinsCount > 0 ? 'ok' : 'critical',
      staffPinsCount > 0 ? `${staffPinsCount} PINs activos.` : 'No hay PINs activos para tablets compartidas.',
      'Crea PINs para mozos/encargados.'
    ),
    makeCheck(
      'team',
      'Equipo invitado',
      teamMembers.length > 0 ? 'ok' : 'warning',
      teamMembers.length > 0 ? `${teamMembers.length} miembros en el equipo.` : 'No hay empleados invitados con cuenta propia.',
      'Invita encargados/mozos si van a entrar con usuario.'
    ),
    makeCheck(
      'kitchen',
      'Pantalla de cocina',
      kitchenDevicesCount > 0 ? 'ok' : 'warning',
      kitchenDevicesCount > 0 ? `${kitchenDevicesCount} dispositivo(s) de cocina activos.` : 'No hay token de cocina activo.',
      'Genera un token para el monitor de cocina.'
    ),
    makeCheck(
      'mp',
      'Terminal Mercado Pago',
      bool(mp.accessToken && mp.deviceId) ? 'ok' : 'warning',
      bool(mp.accessToken && mp.deviceId) ? 'MP Point configurado.' : 'MP Point incompleto o no configurado.',
      'Configura token y terminal si se cobra con Point.'
    ),
    makeCheck(
      'afip',
      'Facturacion AFIP',
      bool(afip.enabled && afip.credentialsReady) ? 'ok' : 'warning',
      bool(afip.enabled && afip.credentialsReady) ? 'Facturacion configurada.' : 'Facturacion incompleta o desactivada.',
      'Completa AFIP/TusFacturas si el cliente emite comprobantes.'
    ),
    makeCheck(
      'stock',
      'Stock bajo',
      lowStock.length === 0 ? 'ok' : 'warning',
      lowStock.length === 0 ? 'No hay ingredientes bajo minimo.' : `${lowStock.length} ingrediente(s) bajo minimo.`,
      'Reponer o ajustar stock antes del servicio.'
    ),
    makeCheck(
      'offline_failed',
      'Operaciones fallidas',
      failedQueue === 0 ? 'ok' : 'critical',
      failedQueue === 0 ? 'Sin operaciones fallidas.' : `${failedQueue} operacion(es) fallaron permanentemente.`,
      'Resolver dead letters antes de abrir jornada.'
    ),
    makeCheck(
      'offline_pending',
      'Cola offline',
      activeQueue === 0 ? 'ok' : 'warning',
      activeQueue === 0 ? 'Sin pendientes de sincronizar.' : `${activeQueue} operacion(es) pendientes de sync.`,
      'Sincronizar antes de abrir o revisar conexion.'
    ),
    makeCheck(
      'network',
      'Conexion actual',
      isOnline ? 'ok' : 'warning',
      isOnline ? 'El navegador esta online.' : 'El navegador esta offline.',
      'Reconectar si se van a abrir/cerrar turnos criticos.'
    ),
  ];

  const critical = checks.filter(c => c.status === 'critical').length;
  const warning = checks.filter(c => c.status === 'warning').length;
  const ok = checks.filter(c => c.status === 'ok').length;
  const score = Math.round((ok / checks.length) * 100);
  const status = critical > 0 ? 'blocked' : warning > 0 ? 'ready_with_warnings' : 'ready';

  return { status, score, critical, warning, ok, total: checks.length, checks, branch, lowStock };
}
