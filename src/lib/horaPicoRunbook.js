export const HORA_PICO_STEPS = [
  {
    id: 'pre_audit_ready',
    phase: 'Preparacion',
    label: 'Auditoria de jornada sin bloqueantes',
    objective: 'Confirmar que caja, menu, PINs, cocina, impresora y cola offline estan en estado operable.',
    evidence: 'Exportar reporte desde Auditoria jornada.',
    required: true,
  },
  {
    id: 'pre_support_empty',
    phase: 'Preparacion',
    label: 'Soporte operativo limpio',
    objective: 'Verificar que no haya dead letters ni operaciones de negocio fallidas antes de empezar.',
    evidence: 'Exportar snapshot desde Soporte operativo.',
    required: true,
  },
  {
    id: 'open_cash_shift',
    phase: 'Caja',
    label: 'Abrir turno de caja',
    objective: 'Abrir caja con fondo inicial y confirmar que queda asociada a la sucursal correcta.',
    evidence: 'Turno abierto visible en Caja y Auditoria jornada.',
    required: true,
  },
  {
    id: 'staff_pin_rotation',
    phase: 'Personal',
    label: 'Cambio de mozo por PIN',
    objective: 'Usar al menos dos mozos/encargados en la misma tablet y confirmar atribucion correcta.',
    evidence: 'TableCard muestra mozo correcto y operaciones quedan atribuidas.',
    required: true,
  },
  {
    id: 'multi_table_load',
    phase: 'Salon',
    label: 'Carga simultanea de mesas',
    objective: 'Abrir 8 a 12 mesas, cargar items, notas, cantidades y modificaciones desde mas de un dispositivo.',
    evidence: 'Salon sincronizado en PC e iPad sin perder items ni notas.',
    required: true,
  },
  {
    id: 'kitchen_realtime',
    phase: 'Cocina',
    label: 'Comandas en monitor cocina',
    objective: 'Enviar comandas desde Salon y confirmar llegada, notas y cambios de estado en monitor.',
    evidence: 'Cocina ve nuevas comandas; Salon recibe estado lista.',
    required: true,
  },
  {
    id: 'printer_comanda',
    phase: 'Impresion',
    label: 'Impresion de comanda y recibo',
    objective: 'Imprimir comanda de cocina y recibo de mesa real con la impresora configurada.',
    evidence: 'Ticket fisico legible, total correcto, notas visibles.',
    required: true,
  },
  {
    id: 'mp_point_payment',
    phase: 'Pagos',
    label: 'Cobro con MP Point Smart',
    objective: 'Cobrar una mesa con terminal, validar timeout/fallback si no confirma rapido.',
    evidence: 'Mesa cerrada, metodo correcto, caja suma total correcto.',
    required: false,
  },
  {
    id: 'mixed_payment',
    phase: 'Pagos',
    label: 'Pago mixto',
    objective: 'Cobrar con dos medios y validar desglose en caja/reportes.',
    evidence: 'pagos_detalle guardado y total de caja correcto.',
    required: true,
  },
  {
    id: 'afip_invoice',
    phase: 'Fiscal',
    label: 'Factura AFIP/ARCA',
    objective: 'Emitir factura B y, si aplica, factura A con CUIT.',
    evidence: 'CAE/PDF visible y registro en historial de facturas.',
    required: false,
  },
  {
    id: 'offline_sale',
    phase: 'Offline',
    label: 'Corte de internet durante servicio',
    objective: 'Cortar internet, agregar items, enviar cocina si relay esta activo, cobrar offline y reconectar.',
    evidence: 'Cola offline sube, sincroniza al volver, sin duplicados.',
    required: true,
  },
  {
    id: 'stock_effects',
    phase: 'Stock',
    label: 'Descuento de stock',
    objective: 'Vender productos con receta y confirmar egreso/descuento idempotente.',
    evidence: 'Stock baja una sola vez aunque haya retry.',
    required: true,
  },
  {
    id: 'close_shift',
    phase: 'Cierre',
    label: 'Cierre de caja y arqueo',
    objective: 'Cerrar turno con retiros, propinas, pagos mixtos y diferencia controlada.',
    evidence: 'Cierre imprime/exporta totales correctos.',
    required: true,
  },
  {
    id: 'post_support_snapshot',
    phase: 'Post prueba',
    label: 'Snapshot final de soporte',
    objective: 'Exportar soporte operativo despues de la prueba y revisar fallas residuales.',
    evidence: 'Snapshot sin business_operations failed ni dead letters.',
    required: true,
  },
];

export function summarizeHoraPicoRunbook(steps = HORA_PICO_STEPS, completedIds = []) {
  const done = new Set(completedIds);
  const requiredSteps = steps.filter(step => step.required);
  const completed = steps.filter(step => done.has(step.id)).length;
  const requiredCompleted = requiredSteps.filter(step => done.has(step.id)).length;
  const blocked = requiredSteps.filter(step => !done.has(step.id));

  return {
    total: steps.length,
    completed,
    required_total: requiredSteps.length,
    required_completed: requiredCompleted,
    percent: steps.length ? Math.round((completed / steps.length) * 100) : 0,
    required_percent: requiredSteps.length ? Math.round((requiredCompleted / requiredSteps.length) * 100) : 0,
    status: blocked.length === 0 ? 'ready_to_run' : completed === 0 ? 'not_started' : 'in_progress',
    blocked,
  };
}

export function groupStepsByPhase(steps = HORA_PICO_STEPS) {
  return steps.reduce((acc, step) => {
    if (!acc[step.phase]) acc[step.phase] = [];
    acc[step.phase].push(step);
    return acc;
  }, {});
}

export function buildHoraPicoEvidenceReport({
  completedIds = [],
  notes = '',
  operator = '',
  generatedAt = new Date().toISOString(),
  steps = HORA_PICO_STEPS,
} = {}) {
  const summary = summarizeHoraPicoRunbook(steps, completedIds);
  const done = new Set(completedIds);

  return {
    generated_at: generatedAt,
    operator,
    notes,
    summary,
    steps: steps.map(step => ({
      id: step.id,
      phase: step.phase,
      label: step.label,
      required: Boolean(step.required),
      completed: done.has(step.id),
      objective: step.objective,
      evidence: step.evidence,
    })),
  };
}
