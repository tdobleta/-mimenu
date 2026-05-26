export function groupByStatus(rows = []) {
  return rows.reduce((acc, row) => {
    const status = row?.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

export function groupQueueByType(rows = []) {
  return rows.reduce((acc, row) => {
    const type = row?.type || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

export function buildSupportOpsSnapshot({
  businessOperations = [],
  auditLogs = [],
  activeQueue = [],
  failedQueue = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const operationStatus = groupByStatus(businessOperations);
  const queueByType = groupQueueByType([...activeQueue, ...failedQueue]);
  const failedOps = businessOperations.filter(op => op.status === 'failed');
  const processingOps = businessOperations.filter(op => op.status === 'processing');

  return {
    generated_at: generatedAt,
    summary: {
      business_operations: businessOperations.length,
      business_failed: failedOps.length,
      business_processing: processingOps.length,
      audit_logs: auditLogs.length,
      offline_active: activeQueue.length,
      offline_failed: failedQueue.length,
    },
    operation_status: operationStatus,
    offline_queue_by_type: queueByType,
    latest_business_operations: businessOperations.slice(0, 20).map(op => ({
      operation_id: op.operation_id || op.id || '',
      type: op.operation_type || '',
      status: op.status || '',
      turn_id: op.turn_id || null,
      created_at: op.created_at || null,
      applied_at: op.applied_at || null,
      last_error: op.last_error || '',
    })),
    latest_audit_logs: auditLogs.slice(0, 20).map(row => ({
      id: row.id || '',
      ts: row.ts || row.created_at || null,
      categoria: row.categoria || '',
      accion: row.accion || '',
      detalle: row.detalle || '',
      usuario: row.usuario || row.usuario_email || '',
    })),
    failed_offline_operations: failedQueue.slice(0, 20).map(op => ({
      id: op.id || '',
      type: op.type || '',
      ts: op.ts || null,
      failed_at: op.failedAt || null,
      last_error: op.lastError || '',
    })),
  };
}
