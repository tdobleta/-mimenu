// ─── Mensajes de error estandarizados en español ─────────────────────────────
// Para mostrar al usuario (mozos, cajeros, encargados) en toasts y banners.
// Importar: import { ERR, classifyError } from '@/lib/errorMessages'

export const ERR = {
  network: 'Sin conexión a internet',
  server: 'Error del servidor — intentá de nuevo',
  permission: 'No tenés permiso para esta acción',
  validation: 'Verificá los datos ingresados',
  notFound: 'No se encontró el registro',
  conflict: 'Otro usuario modificó este registro — recargá la página',
  timeout: 'La operación tardó demasiado — intentá de nuevo',
  unknown: 'Error inesperado — contactá soporte',
  offlineSaved: 'Sin conexión — guardado localmente, se sincronizará al volver',
  syncFailed: 'Error de sincronización — se reintentará automáticamente',
};

/**
 * Clasifica un error en una categoría para elegir el mensaje de ERR.
 * @param {Error|{message?:string, code?:string, status?:number}} err
 * @returns {keyof typeof ERR}
 */
export function classifyError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'network';

  const msg = (err?.message || '').toLowerCase();
  const code = err?.code || '';
  const status = err?.status || err?.statusCode || 0;

  // Permisos Supabase / Postgres
  if (code === '42501' || msg.includes('permiso') || msg.includes('permission') || msg.includes('sin permiso')) {
    return 'permission';
  }

  // No encontrado
  if (code === 'P0002' || code === 'PGRST116' || msg.includes('not found') || msg.includes('no encontr')) {
    return 'notFound';
  }

  // Conflicto / unique violation
  if (code === '23505' || msg.includes('conflict') || msg.includes('duplicate') || msg.includes('ya existe')) {
    return 'conflict';
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return 'timeout';
  }

  // Error de servidor
  if (status >= 500) return 'server';

  return 'unknown';
}

/**
 * Devuelve el mensaje de error en español para mostrar al usuario.
 * @param {Error} err
 * @returns {string}
 */
export function getUserErrorMessage(err) {
  const category = classifyError(err);
  return ERR[category] || ERR.unknown;
}
