/**
 * menuCategories.js
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH para las categorías del menú.
 *
 * Para agregar una nueva categoría (ej: "Panadería") solo
 * agregás un objeto a este array. Todo el sistema lo consume
 * automáticamente: POS, Salón, Analíticas, Onboarding.
 * ─────────────────────────────────────────────────────────────
 */

export const MENU_CATEGORIES = [
  { nombre: 'Entradas',    color: '#3B82F6', bg: '#DBEAFE' },
  { nombre: 'Principales', color: '#1D9E75', bg: '#E8F7F2' },
  { nombre: 'Postres',     color: '#A855F7', bg: '#F3E8FF' },
  { nombre: 'Bebidas',     color: '#06B6D4', bg: '#CFFAFE' },
  { nombre: 'Panadería',   color: '#F97316', bg: '#FFEDD5' },
];

/** Array de nombres — para dropdowns, filtros, etc. */
export const CATEGORY_NAMES = MENU_CATEGORIES.map(c => c.nombre);

/** Default category cuando se crea un plato nuevo */
export const DEFAULT_CATEGORY = 'Principales';

/**
 * Devuelve el color de texto de una categoría.
 * Si no existe en la lista, devuelve un fallback.
 */
export function getCategoryColor(nombre) {
  const cat = MENU_CATEGORIES.find(c => c.nombre === nombre);
  return cat ? cat.color : '#8B5CF6';
}

/**
 * Devuelve el color de fondo de una categoría.
 */
export function getCategoryBg(nombre) {
  const cat = MENU_CATEGORIES.find(c => c.nombre === nombre);
  return cat ? cat.bg : '#F3E8FF';
}

/**
 * Devuelve { color, bg } de una categoría.
 * Útil para badges y chips.
 */
export function getCategoryStyle(nombre) {
  return {
    color: getCategoryColor(nombre),
    bg:    getCategoryBg(nombre),
  };
}
