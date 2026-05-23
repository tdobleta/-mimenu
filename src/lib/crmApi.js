// src/lib/crmApi.js
// API para el módulo CRM: clientes y programa de fidelización.
// $100 gastados = 1 punto. 1 punto = $1 de descuento.

import { supabase } from '@/api/supabaseClient';

const PESOS_POR_PUNTO = 100;   // cada $100 = 1 punto

/** Buscar clientes por nombre o teléfono (mínimo 2 chars) */
export async function searchCustomers(restaurantId, q) {
  if (!q || q.trim().length < 2) return [];
  const term = q.trim();
  const { data } = await supabase
    .from('customers')
    .select('id, nombre, telefono, email, puntos, notas, nacimiento')
    .eq('restaurant_id', restaurantId)
    .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`)
    .order('nombre')
    .limit(10);
  return data || [];
}

/** Obtener un cliente con su historial de visitas */
export async function getCustomer(id) {
  const { data } = await supabase
    .from('customers')
    .select('*, customer_visits(id, fecha, total_gastado, puntos_ganados, puntos_canjeados)')
    .eq('id', id)
    .order('fecha', { referencedTable: 'customer_visits', ascending: false })
    .single();
  return data;
}

/** Crear cliente nuevo */
export async function createCustomer(restaurantId, { nombre, telefono, email, notas, nacimiento }) {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurantId,
      nombre: nombre.trim(),
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      notas: notas?.trim() || null,
      nacimiento: nacimiento || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Actualizar cliente */
export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Eliminar cliente (y sus visitas por CASCADE) */
export async function deleteCustomer(id) {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Registrar visita y actualizar puntos.
 * @param {string} restaurantId
 * @param {string} customerId
 * @param {string|null} turnId
 * @param {number} totalGastado — monto final pagado (ya con descuentos)
 * @param {number} puntosCanjeados — puntos redimidos en esta visita
 * @returns {number} puntosGanados
 */
export async function addCustomerVisit(restaurantId, customerId, turnId, totalGastado, puntosCanjeados = 0) {
  const puntosGanados = Math.floor(Math.max(0, totalGastado) / PESOS_POR_PUNTO);

  const { error: visitError } = await supabase.from('customer_visits').insert({
    customer_id:      customerId,
    turn_id:          turnId || null,
    total_gastado:    totalGastado,
    puntos_ganados:   puntosGanados,
    puntos_canjeados: puntosCanjeados,
  });
  if (visitError) throw visitError;

  // Operaciones atómicas — sin read-modify-write en JS
  if (puntosGanados > 0) {
    await supabase.rpc('increment_customer_points', { p_id: customerId, p_pts: puntosGanados });
  }
  if (puntosCanjeados > 0) {
    await supabase.rpc('decrement_customer_points', { p_id: customerId, p_pts: puntosCanjeados });
  }

  return puntosGanados;
}

/** Listar todos los clientes del restaurante */
export async function getAllCustomers(restaurantId, { limit = 200 } = {}) {
  const { data } = await supabase
    .from('customers')
    .select('id, nombre, telefono, email, puntos, notas, nacimiento, created_at')
    .eq('restaurant_id', restaurantId)
    .order('nombre')
    .limit(limit);
  return data || [];
}

/** Top clientes por total gastado */
export async function getTopCustomers(restaurantId, limit = 30) {
  const { data } = await supabase
    .from('customers')
    .select(`
      id, nombre, telefono, email, puntos,
      customer_visits(total_gastado, fecha)
    `)
    .eq('restaurant_id', restaurantId)
    .limit(200);  // traemos más para calcular el ranking en JS

  return (data || [])
    .map(c => ({
      ...c,
      totalGastado: (c.customer_visits || []).reduce((a, v) => a + (v.total_gastado || 0), 0),
      visitas:       (c.customer_visits || []).length,
      ultimaVisita:  (c.customer_visits || [])
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]?.fecha || null,
    }))
    .sort((a, b) => b.totalGastado - a.totalGastado)
    .slice(0, limit);
}

/** Clientes con cumpleaños en los próximos N días */
export async function getCustomersBirthdays(restaurantId, daysAhead = 7) {
  const { data } = await supabase
    .from('customers')
    .select('id, nombre, telefono, email, puntos, nacimiento')
    .eq('restaurant_id', restaurantId)
    .not('nacimiento', 'is', null);

  if (!data) return [];

  const today = new Date();
  return data
    .filter(c => {
      if (!c.nacimiento) return false;
      const bday = new Date(c.nacimiento);
      for (let i = 0; i <= daysAhead; i++) {
        const check = new Date(today);
        check.setDate(today.getDate() + i);
        if (bday.getMonth() === check.getMonth() && bday.getDate() === check.getDate()) {
          c._diasParaCumple = i;
          return true;
        }
      }
      return false;
    })
    .sort((a, b) => a._diasParaCumple - b._diasParaCumple);
}

/** Cantidad de pesos por punto (para mostrar en UI) */
export const PESOS_POR_PUNTO_CONST = PESOS_POR_PUNTO;
