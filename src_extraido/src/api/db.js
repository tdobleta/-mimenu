import { supabase } from './supabaseClient';

const TABLE_MAP = {
  Restaurant: 'restaurants', Branch: 'branches', TeamMember: 'team_members',
  MenuItem: 'menu_items', CajaShift: 'caja_shifts', Turn: 'turns',
  TurnItem: 'turn_items', Reservation: 'reservations', StockItem: 'stock_items',
  Alert: 'alerts', AuditLog: 'audit_logs', User: '_users',
};

function buildEntity(entityName) {
  const table = TABLE_MAP[entityName];
  if (!table) throw new Error('Entidad desconocida: ' + entityName);
  return {
    async filter(conditions = {}, sort = null, limit = 1000) {
      if (table === '_users') return [];
      let query = supabase.from(table).select('*');
      for (const [key, val] of Object.entries(conditions)) {
        if (val === null || val === undefined) query = query.is(key, null);
        else if (Array.isArray(val)) query = query.in(key, val);
        else query = query.eq(key, val);
      }
      if (sort) {
        const asc = !sort.startsWith('-');
        const field = sort.replace(/^-/, '').replace('created_date', 'created_at');
        query = query.order(field, { ascending: asc });
      } else {
        query = query.order('created_at', { ascending: false });
      }
      if (limit && limit < 10000) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    async list(sort = null, limit = 1000) {
      if (table === '_users') return [];
      return this.filter({}, sort, limit);
    },
    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    async bulkCreate(items) {
      if (!items || items.length === 0) return [];
      const { data, error } = await supabase.from(table).insert(items).select();
      if (error) throw error;
      return data ?? [];
    },
  };
}

const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, email: user.email, role: user.app_metadata?.role ?? 'user' };
  },
  logout(redirectUrl) {
    supabase.auth.signOut().then(() => { window.location.href = redirectUrl ?? '/login'; });
  },
  redirectToLogin(fromUrl) {
    window.location.href = fromUrl ? '/login?from=' + encodeURIComponent(fromUrl) : '/login';
  },
};

const entities = new Proxy({}, { get(_, entityName) { return buildEntity(entityName); } });
export const db = { entities, auth };
