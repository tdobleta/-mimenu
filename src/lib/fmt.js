export function money(v) {
  if (v == null || isNaN(v)) return '$\u00A00';
  return '$\u00A0' + Math.round(v).toLocaleString('es-AR');
}

export function dateLong(date) {
  const d = date instanceof Date ? date : new Date(date);
  const days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dd = String(d.getDate()).padStart(2,'0');
  const raw = `${days[d.getDay()]}, ${dd} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function dateShort(str) {
  if (!str) return '';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export function elapsedMin(ts) {
  return Math.max(0, Math.floor((Date.now() - ts) / 60000));
}

export function fmtElapsed(min) {
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60); const rem = min % 60;
  return rem === 0 ? `hace ${h}h` : `hace ${h}h ${rem}m`;
}

export function fmtTableTime(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60); const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function tableTotal(order) {
  return (order || []).reduce((s, i) => s + i.precio * i.qty, 0);
}

export function formatFecha(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function stockStatus(item) {
  if (item.actual === 0) return 'sin stock';
  if (item.actual < item.minimo) return 'bajo';
  return 'ok';
}


