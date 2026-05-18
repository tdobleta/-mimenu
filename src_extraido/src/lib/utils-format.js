import moment from 'moment';

export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '$0';
  return '$' + Math.round(value).toLocaleString('es-AR').replace(/,/g, '.');
}

export function formatDate(date) {
  return moment(date).format('DD/MM/YYYY');
}

export function formatPercent(value, showSign = true) {
  if (value == null || isNaN(value)) return '0%';
  const sign = showSign && value > 0 ? '+' : '';
  return sign + Math.round(value) + '%';
}

export function abbreviateNumber(value) {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
  return String(Math.round(value));
}

export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function getDayOfWeekIndex(date) {
  const d = new Date(date);
  return d.getDay() === 0 ? 6 : d.getDay() - 1;
}


