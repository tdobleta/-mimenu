import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

export function useRestaurantData() {
  const [restaurant,    setRestaurant]    = useState(null);
  const [branches,      setBranches]      = useState([]);
  const [activeBranchId, setActiveBranchId] = useState('all');
  const [loading,       setLoading]       = useState(true);
  const [user,          setUser]          = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (!sbUser) { setLoading(false); return; }

      const me = { id: sbUser.id, email: sbUser.email, role: sbUser.app_metadata?.role ?? 'user' };
      setUser(me);

      // Intentar por owner_id primero
      let { data: rests } = await supabase.from('restaurants').select('*').eq('owner_id', sbUser.id).limit(1);
      if (!rests || rests.length === 0) {
        const res2 = await supabase.from('restaurants').select('*').eq('owner_email', sbUser.email).limit(1);
        rests = res2.data;
      }

      if (rests && rests.length > 0) {
        setRestaurant(rests[0]);
        const { data: branchList } = await supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', rests[0].id);
        setBranches(branchList ?? []);
      }
    } catch (err) {
      console.error('useRestaurantData error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getBranchIds = useCallback(() => {
    if (activeBranchId === 'all') return branches.map(b => b.id);
    return [activeBranchId];
  }, [activeBranchId, branches]);

  const activeBranch = branches.find(b => b.id === activeBranchId) || null;
  const hasConnection = branches.some(b => b.metodo_conexion && b.metodo_conexion !== 'ninguno');

  const connectionLabel = (() => {
    const b = activeBranchId !== 'all' ? activeBranch : branches.find(b => b.metodo_conexion && b.metodo_conexion !== 'ninguno');
    if (!b) return null;
    const m = b.metodo_conexion;
    if (m === 'fudo') return 'Fudo';
    if (m === 'mercadopago') return 'MercadoPago';
    if (m === 'manual') return 'Manual';
    return null;
  })();

  return {
    restaurant, branches, activeBranchId, setActiveBranchId,
    activeBranch, loading, user, getBranchIds, loadData,
    hasConnection, connectionLabel,
  };
}
