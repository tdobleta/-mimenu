// lib/export.js
// Utilidades para exportar datos a CSV compatible con Excel (es-AR).
// Incluye BOM UTF-8 para que Excel argentino abra correctamente con tildes.

/**
 * Descarga un string CSV como archivo.
 * @param {string} csv  — contenido completo del CSV
 * @param {string} filename
 */
function downloadCSV(csv, filename) {
  const BOM = '﻿'; // BOM UTF-8 — Excel lo necesita para tildes y ñ
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Escapa un valor para CSV: lo envuelve en comillas dobles y escapa las comillas internas.
 */
function esc(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Formatea una fecha ISO al locale argentino (zona horaria Argentina).
 */
function fmtFecha(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

// ── Exportar turns (ventas) ────────────────────────────────────────────────────

/**
 * Exporta un array de turns cerrados a CSV.
 * Columnas: Fecha, Mesa, Mozo, Método de Pago, Total, Propina, Descuento
 *
 * @param {Array}  turns     — array de turn objects (closed_at, mesa_num, mozo, etc.)
 * @param {string} [filename] — nombre del archivo .csv
 */
export function exportTurnsCSV(turns, filename = 'ventas.csv') {
  const headers = ['Fecha', 'Mesa', 'Mozo', 'Método de pago', 'Total', 'Propina', 'Descuento'];
  const rows = (turns || []).map(t => [
    fmtFecha(t.closed_at),
    t.mesa_num || '',
    t.mozo     || '',
    t.metodo_pago || '',
    ((t.total_facturado || 0) + (t.propina || 0)).toFixed(2),
    (t.propina   || 0).toFixed(2),
    (t.descuento || 0).toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  downloadCSV(csv, filename);
}

// ── Exportar stock ────────────────────────────────────────────────────────────

/**
 * Exporta el stock actual de un branch a CSV.
 * Columnas: Ingrediente, Unidad, Stock actual, Mínimo, Alerta
 *
 * @param {Array}  items     — array de stock_item objects
 * @param {string} [filename]
 */
export function exportStockCSV(items, filename = 'stock.csv') {
  const headers = ['Ingrediente', 'Unidad', 'Stock actual', 'Mínimo', 'Alerta'];
  const rows = (items || []).map(it => [
    it.nombre || '',
    it.unidad  || '',
    (it.actual  ?? '').toString(),
    (it.minimo  ?? '').toString(),
    (it.actual ?? 0) < (it.minimo ?? 0) ? 'Bajo stock' : '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  downloadCSV(csv, filename);
}

// ── Exportar turno de caja (cierre) ───────────────────────────────────────────

/**
 * Exporta el resumen de un turno de caja cerrado.
 * Útil para el arqueo físico del encargado.
 *
 * @param {Object} turno        — caja_shift object con totales
 * @param {Array}  turns        — turns cerrados del turno
 * @param {string} [filename]
 */
export function exportCajaTurnoCSV(turno, turns, filename = 'cierre-caja.csv') {
  // Resumen general
  const resumen = [
    ['Campo', 'Valor'],
    ['Sucursal', turno.branch_nombre || ''],
    ['Apertura', fmtFecha(turno.abierto_at)],
    ['Cierre',   fmtFecha(turno.cerrado_at)],
    ['Fondo inicial', (turno.fondo_inicial || 0).toFixed(2)],
    ['Total ventas', (turno.total_facturado_turno || 0).toFixed(2)],
    ['Propinas', (turns || []).reduce((a, t) => a + (t.propina || 0), 0).toFixed(2)],
    ['Retiros', (() => {
      let ret = turno.retiros;
      if (typeof ret === 'string') try { ret = JSON.parse(ret); } catch { ret = []; }
      return Array.isArray(ret) ? ret.reduce((a, r) => a + (r.monto || 0), 0).toFixed(2) : '0.00';
    })()],
    ['Diferencia', (turno.diferencia_caja || 0).toFixed(2)],
    ['Arqueo', (turno.arqueo || 0).toFixed(2)],
    [],
    ['--- Detalle de ventas ---'],
    ['Fecha', 'Mesa', 'Mozo', 'Método', 'Total', 'Propina', 'Descuento'],
    ...(turns || []).map(t => [
      fmtFecha(t.closed_at),
      t.mesa_num || '',
      t.mozo || '',
      t.metodo_pago || '',
      ((t.total_facturado || 0) + (t.propina || 0)).toFixed(2),
      (t.propina   || 0).toFixed(2),
      (t.descuento || 0).toFixed(2),
    ]),
  ];
  const csv = resumen.map(r => r.map(esc).join(',')).join('\r\n');
  downloadCSV(csv, filename);
}
