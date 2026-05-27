// ─── mimenú Glass Theme ───────────────────────────────────────────────────────
// Importá desde cualquier componente: import { glass, glassDeep, G, gCard } from '@/lib/glass'

export const G = {
  teal:        '#1D9E75',
  tealMid:     '#5DCAA5',
  tealLight:   '#E1F5EE',
  tealPale:    'rgba(29,158,117,0.08)',
  blue:        '#378ADD',
  blueLight:   '#E6F1FB',
  violet:      '#7F77DD',
  violetLight: '#EEEDFE',
  amber:       '#EF9F27',
  amberLight:  '#FAEEDA',
  red:         '#E24B4A',
  redLight:    '#FCEBEB',
  coral:       '#D85A30',
  coralLight:  '#FAECE7',
  text:        '#0F172A',
  textMid:     '#334155',
  textMuted:   '#64748B',
  textFaint:   '#94A3B8',
};

// Fondo global de la app
export const APP_BG = '#F1F5F9';

// Card estándar
export const glass = (extra = {}) => ({
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  borderRadius: 12,
  ...extra,
});

// Panel prominente (panels grandes)
export const glassDeep = (extra = {}) => ({
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.05)',
  borderRadius: 16,
  ...extra,
});

// Inner card / pill sutil
export const glassLight = (extra = {}) => ({
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  borderRadius: 8,
  ...extra,
});

// Tipografía
export const fontDisplay = "'Playfair Display', Georgia, serif";
export const fontUI = "'DM Sans', system-ui, sans-serif";

// Label de sección
export const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: G.textFaint,
  marginBottom: 6,
};

// Número grande (KPI)
export const bigNumStyle = {
  fontSize: 30,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: G.text,
  fontFamily: fontDisplay,
  lineHeight: 1.1,
};

// ─── Responsive ──────────────────────────────────────────────────────────────

// Breakpoints (px) — alineados con Tailwind defaults
export const BP = { sm: 640, md: 768, lg: 1024, xl: 1280 };

// Media query strings para window.matchMedia() en hooks JS
export const MQ = {
  sm: `(min-width: ${BP.sm}px)`,
  md: `(min-width: ${BP.md}px)`,
  lg: `(min-width: ${BP.lg}px)`,
  xl: `(min-width: ${BP.xl}px)`,
};

// Ancho de modal responsive — reemplaza todos los width:XXX hardcodeados
// Uso: <div style={{ ...modalWidth(460), ... }}>
export const modalWidth = (maxPx) => ({
  width: '100%',
  maxWidth: `min(${maxPx}px, 95vw)`,
});

// Padding responsive para contenedores principales
export const containerPad = {
  padding: 'clamp(12px, 3vw, 24px)',
};

// Colores por estado de mesa
export const tableStatusColor = {
  ocupada:   G.teal,
  libre:     '#D1D5DB',
  reservada: G.blue,
  demorada:  G.red,
};
export const tableStatusBg = {
  ocupada:   G.tealLight,
  libre:     '#F3F4F6',
  reservada: G.blueLight,
  demorada:  G.redLight,
};
