/**
 * app-params.js
 * Variables de entorno para mimenú.
 * Anteriormente gestionado por Base44, ahora por Supabase.
 */
export const appParams = {
  supabaseUrl:  import.meta.env.VITE_SUPABASE_URL  ?? '',
  supabaseKey:  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
};
