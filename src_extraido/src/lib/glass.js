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
  text:        '#1a1a2e',
  textMid:     '#374151',
  textMuted:   '#6B7280',
  textFaint:   '#9BA3B8',
};

// Fondo global de la app
export const APP_BG = 'linear-gradient(140deg, #eef2ff 0%, #f8fffc 35%, #fdf4ff 70%, #fff8f0 100%)';

// Card glass estándar
export const glass = (extra = {}) => ({
  background: 'rgba(255,255,255,0.55)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.78)',
  boxShadow: '0 4px 24px rgba(80,80,180,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
  borderRadius: 18,
  ...extra,
});

// Card glass más prominente (panels grandes)
export const glassDeep = (extra = {}) => ({
  background: 'rgba(255,255,255,0.45)',
  backdropFilter: 'blur(28px) saturate(190%)',
  WebkitBackdropFilter: 'blur(28px) saturate(190%)',
  border: '1px solid rgba(255,255,255,0.70)',
  boxShadow: '0 8px 40px rgba(60,60,160,0.08), inset 0 1px 0 rgba(255,255,255,0.98), 0 1px 2px rgba(0,0,0,0.03)',
  borderRadius: 22,
  ...extra,
});

// Card glass sutil (inner cards, pills)
export const glassLight = (extra = {}) => ({
  background: 'rgba(255,255,255,0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
  borderRadius: 12,
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
