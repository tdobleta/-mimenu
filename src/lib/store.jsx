import { supabase } from "@/api/supabaseClient";
import { base44 } from '@/api/base44Client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchClosedTurnsPaginated, fetchTurnItemsBatch } from '@/lib/pagination';

const now = () => Date.now();

function emptyState() {
  return {
    loading: true,
    restaurante: { nombre: '', direccion: '', telefono: '' },
    branchId: null,
    sucursales: [],
    tables: {},
    gridConfig: {},
    reservas: {},
    stock: {},
    menuItems: {},
    equipo: [],
    activity: {},
    charts: {},
    auditoria: [],
    alerts: 0,
    isDemo: false,
    closedTurns: [],
    turnoActivo: null,
    teamMembers: [],
    restaurantId: null,
    ownerEmail: null,
    needsOnboarding: false,
    isInvitedUser: false,
  };
}

function buildTablesForBranch(branchId, numMesas) {
  return Array.from({ length: numMesas }, (_, i) => ({
    id: i + 1,
    num: i + 1,
    status: 'libre',
    sillas: 4,
    gridCol: (i % 4) + 1,
    gridRow: Math.floor(i / 4) + 1,
    order: [],
    mozo: null,
    openedAt: null,
    clientName: null,
    turnId: null,
  }));
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [s, setS] = useState(emptyState);

  const initInProgressRef = useRef(false);

  useEffect(() => {

  async function init() {
    if (initInProgressRef.current) return;
    initInProgressRef.current = true;
      try {
        const user = await base44.auth.me();
        if (!user) {
          // No hay sesiÃ³n â€” AuthContext se encarga de redirigir al login
          return;
        }
        // Intentar por owner_id primero (mÃ¡s preciso), luego por email
        let restaurants = await base44.entities.Restaurant.filter({ owner_id: user.id });
        if (!restaurants || restaurants.length === 0) {
          restaurants = await base44.entities.Restaurant.filter({ owner_email: user.email });
        }

        let memberships = [];
        try {
          const byEmail = await base44.entities.TeamMember.filter({ email: user.email }).catch(() => []);
          memberships = (byEmail || []).filter(m => m.email === user.email);
        } catch(e) {}

        // Solo reintentar si hay un restaurante incompleto â€” posible usuario invitado
        // en su primer login. Para dueÃ±os nuevos no hay reintento.
        if (memberships.length === 0 && restaurants && restaurants.length > 0 && !restaurants[0]?.onboarding_completado) {
          await new Promise(res => setTimeout(res, 1200));
          try {
            const byEmail2 = await base44.entities.TeamMember.filter({ email: user.email }).catch(() => []);
            memberships = (byEmail2 || []).filter(m => m.email === user.email);
          } catch(e) {}
        }

        let restaurant;

        if (restaurants && restaurants.length > 0 && restaurants[0].onboarding_completado) {
          // DueÃ±o con onboarding completo â€” es el dueÃ±o del restaurante
          restaurant = restaurants[0];
        } else if (memberships.length > 0) {
          // Es miembro de equipo â€” cargar el restaurante al que pertenece
          // (tiene prioridad sobre un restaurante propio incompleto de un intento anterior)
          const rid = memberships[0].restaurant_id;
          const ownerRestaurants = await base44.entities.Restaurant.filter({ id: rid }).catch(() => []);
          if (ownerRestaurants && ownerRestaurants.length > 0) {
            restaurant = ownerRestaurants[0];
          } else {
            restaurant = {
              id: rid,
              nombre: '',
              direccion: '',
              telefono: '',
              owner_email: null,
              onboarding_completado: true,
            };
          }
        } else if (restaurants && restaurants.length > 0) {
          // Tiene restaurante propio sin completar â€” continuar onboarding
          restaurant = restaurants[0];
        } else {
          // Usuario genuinamente nuevo â€” crear restaurante y arrancar onboarding
          restaurant = await base44.entities.Restaurant.create({
            nombre: 'Mi Restaurante',
            owner_email: user.email,
            owner_id: user.id,
            onboarding_completado: false,
          });
          await base44.entities.Branch.create({
            restaurant_id: restaurant.id,
            nombre: 'Principal',
            mesas: 8,
            franjas: ['12:00','13:00','20:00','21:00'],
            metodo_conexion: 'mimenú POS',
          });
        }
        const branches = await base44.entities.Branch.filter({ restaurant_id: restaurant.id });

        if (!branches || branches.length === 0) {
          setS(prev => ({
            ...prev,
            loading: false,
            restaurante: { nombre: restaurant.nombre || '', direccion: restaurant.direccion || '', telefono: restaurant.telefono || '' },
            isDemo: false,
          }));
          return;
        }

        const menuItemsArrays = await Promise.all(
          branches.map(b => base44.entities.MenuItem.filter({ branch_id: b.id }).catch(() => []))
        );
        const menuItemsByBranch = {};
        branches.forEach((b, i) => {
          menuItemsByBranch[b.id] = (menuItemsArrays[i] || []).map(item => ({
            id: item.id,
            nombre: item.nombre || '',
            precio: item.precio || 0,
            categoria: item.categoria || 'Principales',
            disponible: item.activo !== false,
          }));
        });
        const teamMembersDb = await base44.entities.TeamMember.filter({ restaurant_id: restaurant.id }).catch(() => []);

        const tables = {};
        const gridConfig = {};
        const reservas = {};
        const stock = {};
        const activity = {};
        const charts = {};

        branches.forEach(branch => {
          const numMesas = branch.mesas || 4;
          tables[branch.id] = buildTablesForBranch(branch.id, numMesas);
          gridConfig[branch.id] = { cols: 4, rows: Math.ceil(numMesas / 4) };
          reservas[branch.id] = [];
          stock[branch.id] = [];
          activity[branch.id] = [];
          charts[branch.id] = {
            week: ['lun','mar','mié','jue','vie','sáb','dom'].map(day => ({ day, actual: 0, anterior: 0 })),
            month: Array.from({length:30},(_,i)=>({ day:`${i+1}`, actual:0, anterior:0 })),
            year: ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].map(mes=>({mes,actual:0,anterior:0})),
            topProducts: [],
            facturacionHoy: 0,
            facturacionAyer: 0,
            ticketPromedio: 0,
            ticketAnterior: 0,
          };
        });

        // Cargar stock desde DB para cada branch
        try {
          const stockArrays = await Promise.all(
            branches.map(b => base44.entities.StockItem.filter({ branch_id: b.id }).catch(() => []))
          );
          branches.forEach((b, i) => {
            stock[b.id] = (stockArrays[i] || []).map(it => ({
              id: it.id,
              nombre: it.nombre || '',
              unidad: it.unidad || 'kg',
              actual: it.actual ?? 0,
              minimo: it.minimo ?? 0,
            }));
          });
        } catch(e) {}

        let turnoActivo = null;
        try {
          const shiftArrays = await Promise.all(
            branches.map(b => base44.entities.CajaShift.filter({ branch_id: b.id, status: 'abierto' }).catch(() => []))
          );
          const allOpen = shiftArrays.flat();
          const activeBranchId = s?.branchId && s.branchId !== 'todas' ? s.branchId : branches[0].id;
          let chosen = allOpen.find(sh => sh.branch_id === activeBranchId) || allOpen.find(sh => sh.branch_id === branches[0].id) || allOpen[0];
          if (chosen) {
            let parsedRetiros = [];
            try { parsedRetiros = JSON.parse(chosen.retiros || '[]'); } catch(e) {}
            // Reconstruir totalCache desde Turns reales para que el nÃºmero en pantalla sea correcto
            const turnsDelTurno = await base44.entities.Turn.filter({
              caja_shift_id: chosen.id,
              status: 'cerrada',
            }).catch(() => []);
            const totalCacheReal = (turnsDelTurno || []).reduce((a, t) => a + (t.total_facturado || 0) + (t.propina || 0), 0);

            turnoActivo = {
              id: chosen.id,
              branchId: chosen.branch_id,
              fondoInicial: chosen.fondo_inicial || 0,
              abiertaAt: chosen.abierto_at,
              tipoTurno: chosen.tipo_turno,
              retiros: parsedRetiros,
              totalCache: totalCacheReal,
            };
          }
        } catch(e) {}

        // Cargar reservas desde DB para cada branch en paralelo
        try {
          const reservasArrays = await Promise.all(
            branches.map(b => base44.entities.Reservation.filter({ branch_id: b.id }).catch(() => []))
          );
          branches.forEach((b, i) => {
            reservas[b.id] = (reservasArrays[i] || []).map(r => ({
              id: r.id,
              fecha: r.fecha || '',
              hora: r.hora || '',
              nombre: r.nombre || '',
              telefono: r.telefono || '',
              email: r.email || '',
              personas: r.personas || 0,
              mesa: r.mesa || '-',
              canal: r.canal || 'Manual',
              estado: r.estado || 'confirmada',
              notas: r.notas || '',
            }));
          });
        } catch(e) {}

        const branchIds = branches.map(b => b.id);
        const openTurnArrays = await Promise.all(
          branchIds.map(bid =>
            base44.entities.Turn.filter({ branch_id: bid, status: 'abierta' }).catch(() => [])
          )
        );
        const openTurns = openTurnArrays.flat();
        if (openTurns && openTurns.length > 0) {
          openTurns.forEach(turn => {
            const bid = turn.branch_id;
            if (tables[bid]) {
              const mesa = tables[bid].find(t => t.num === turn.mesa_num);
              if (mesa) {
                mesa.status = 'ocupada';
                mesa.openedAt = turn.opened_at;
                mesa.mozo = turn.mozo || null;
                mesa.turnId = turn.id;
                mesa.order = [];
              }
            }
          });

          try {
            const allItems = await fetchTurnItemsBatch(openTurns.map(t => t.id));
            openTurns.forEach((turn) => {
              const items = allItems.filter(it => it.turn_id === turn.id);
              const bid = turn.branch_id;
              if (tables[bid] && items.length > 0) {
                const mesa = tables[bid].find(t => t.turnId === turn.id);
                if (mesa) {
                  mesa.order = items.map(item => ({
                    itemId: item.menu_item_id || ('libre_' + item.id),
                    nombre: item.menu_item_name || '',
                    precio: item.precio || 0,
                    qty: item.cantidad || 1,
                    turnItemId: item.id,
                    libre: !item.menu_item_id,
                  }));
                }
              }
            });
          } catch(e) {}
        }

        setS(prev => ({
          ...prev,
          loading: false,
          isDemo: false,
          restaurante: { nombre: restaurant.nombre || '', direccion: restaurant.direccion || '', telefono: restaurant.telefono || '' },
          branchId: branches[0].id,
          sucursales: branches.map(b => ({
            id: b.id,
            nombre: b.nombre || 'Sucursal',
            direccion: b.direccion || '',
            conexion: b.metodo_conexion || 'mimenú POS',
            mesas: b.mesas || 4,
            franjas: b.franjas || ['12:00','13:00','20:00','21:00'],
          })),
          menuItems: menuItemsByBranch,
          tables,
          gridConfig,
          reservas,
          stock,
          activity,
          charts,
          turnoActivo,
          teamMembers: teamMembersDb || [],
          restaurantId: restaurant.id,
          ownerEmail: restaurant.owner_email || null,
          needsOnboarding: !restaurant.onboarding_completado,
        }));

      } catch (err) {
        console.error('Error init:', err);
        setS(prev => ({ ...prev, loading: false, isDemo: false }));
      } finally {
        initInProgressRef.current = false;
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) init();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) init();
      if (event === 'SIGNED_OUT') setS(emptyState());
      // TOKEN_REFRESHED: no re-ejecutar init() — solo renueva el JWT
    });
    return () => subscription.unsubscribe();
  }, []);

  const update = useCallback((fn) => setS(prev => ({ ...prev, ...fn(prev) })), []);
  const setBranchId = (id) => setS(p => ({ ...p, branchId: id }));

  const branchInitRef = useRef(false);
  useEffect(() => {
    if (!branchInitRef.current) {
      if (s.branchId) branchInitRef.current = true;
      return;
    }
    if (!s.branchId) return;
    const targetBid = s.branchId === 'todas' ? s.sucursales[0]?.id : s.branchId;
    if (!targetBid) return;
    // Solo recargar si no tenemos los Ã­tems de esa branch todavÃ­a
    if (s.menuItems[targetBid]) return;
    (async () => {
      try {
        const items = await base44.entities.MenuItem.filter({ branch_id: targetBid });
        setS(p => ({
          ...p,
          menuItems: {
            ...p.menuItems,
            [targetBid]: (items || []).map(item => ({
              id: item.id,
              nombre: item.nombre || '',
              precio: item.precio || 0,
              categoria: item.categoria || 'Principales',
              disponible: item.activo !== false,
            })),
          },
        }));
      } catch(e) {}
    })();
  }, [s.branchId, s.sucursales]);
  const updateRestaurante = (data) => setS(p => ({ ...p, restaurante: { ...p.restaurante, ...data } }));

  const openTable = (bid, tid, openedAt) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, status:'ocupada', openedAt: openedAt || Date.now(), order:[] } : t) }
  }));
  const closeTable = (bid, tid) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, status:'libre', openedAt:null, order:[], mozo:null, turnId:null } : t) }
  }));
  const openTableWithTurn = (bid, tid, turnId, mozo, openedAt) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, status:'ocupada', openedAt: openedAt || Date.now(), order:[], mozo: mozo || t.mozo, turnId } : t) }
  }));
  const setTableTurnId = (bid, tid, turnId) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, turnId } : t) }
  }));
  const setTableComandaLista = (bid, tableId, lista) => setS(p => ({
    ...p,
    tables: {
      ...p.tables,
      [bid]: (p.tables[bid] || []).map(t =>
        t.id === tableId ? { ...t, comandaLista: lista } : t
      ),
    },
  }));
  const setOrderItemTurnItemId = (bid, tid, itemId, turnItemId) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, order: (t.order||[]).map(i => i.itemId === itemId ? { ...i, turnItemId } : i) } : t) }
  }));
  const updateTableOrder = (bid, tid, order) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: p.tables[bid].map(t => t.id === tid ? { ...t, order } : t) }
  }));
  const saveLayout = (bid, tables, grid) => setS(p => ({
    ...p, tables: { ...p.tables, [bid]: tables }, gridConfig: { ...p.gridConfig, [bid]: grid }
  }));
  const addReservation = (bid, res) => setS(p => ({
    ...p, reservas: { ...p.reservas, [bid]: [...(p.reservas[bid]||[]), res] }
  }));
  const updateReservation = (bid, id, data) => setS(p => ({
    ...p, reservas: { ...p.reservas, [bid]: (p.reservas[bid]||[]).map(r => r.id === id ? { ...r, ...data } : r) }
  }));
  const addStockItem = (bid, item) => setS(p => ({
    ...p, stock: { ...p.stock, [bid]: [...(p.stock[bid]||[]), item] }
  }));
  const updateStockItem = (bid, id, data) => setS(p => ({
    ...p, stock: { ...p.stock, [bid]: (p.stock[bid]||[]).map(i => i.id === id ? { ...i, ...data } : i) }
  }));
  const deleteStockItem = (bid, id) => setS(p => ({
    ...p, stock: { ...p.stock, [bid]: (p.stock[bid]||[]).filter(i => i.id !== id) }
  }));
  const addMenuItem = (branchId, item) => setS(p => ({ ...p, menuItems: { ...p.menuItems, [branchId]: [...(p.menuItems[branchId]||[]), item] } }));
  const updateMenuItem = (branchId, id, data) => setS(p => ({ ...p, menuItems: { ...p.menuItems, [branchId]: (p.menuItems[branchId]||[]).map(i => i.id === id ? { ...i, ...data } : i) } }));
  const deleteMenuItem = (branchId, id) => setS(p => ({ ...p, menuItems: { ...p.menuItems, [branchId]: (p.menuItems[branchId]||[]).filter(i => i.id !== id) } }));
  const setMenuItems = (branchId, items) => setS(p => ({ ...p, menuItems: { ...p.menuItems, [branchId]: items } }));
  const updateSucursal = (id, data) => setS(p => ({ ...p, sucursales: p.sucursales.map(su => su.id === id ? { ...su, ...data } : su) }));
  const addEquipo = (member) => setS(p => ({ ...p, equipo: [...p.equipo, member] }));

  const getCharts = () => {
    if (!s.branchId || !s.charts[s.branchId]) return {
      week: [], month: [], year: [], topProducts: [],
      facturacionHoy: 0, facturacionAyer: 0, ticketPromedio: 0, ticketAnterior: 0,
    };
    if (s.branchId === 'todas') {
      const branches = s.sucursales;
      if (branches.length === 0) return { week:[], month:[], year:[], topProducts:[], facturacionHoy:0, facturacionAyer:0, ticketPromedio:0, ticketAnterior:0 };
      const allCharts = branches.map(b => s.charts[b.id]).filter(Boolean);
      if (allCharts.length === 0) return { week:[], month:[], year:[], topProducts:[], facturacionHoy:0, facturacionAyer:0, ticketPromedio:0, ticketAnterior:0 };

      // Combinar week sumando por fecha
      const weekMap = {};
      allCharts.forEach(c => {
        (c.week || []).forEach(d => {
          if (!weekMap[d.day]) weekMap[d.day] = { day: d.day, actual: 0, anterior: 0 };
          weekMap[d.day].actual   += d.actual   || 0;
          weekMap[d.day].anterior += d.anterior || 0;
        });
      });
      const DAY_ORDER = ['lun','mar','mié','jue','vie','sáb','dom'];
      const week = DAY_ORDER.map(day => weekMap[day] || { day, actual: 0, anterior: 0 });

      // Combinar topProducts sumando unidades y monto
      const productMap = {};
      allCharts.forEach(c => {
        (c.topProducts || []).forEach(p => {
          if (!productMap[p.nombre]) productMap[p.nombre] = { ...p };
          else { productMap[p.nombre].unidades += p.unidades; productMap[p.nombre].monto += p.monto; }
        });
      });
      const topProducts = Object.values(productMap).sort((a, b) => b.unidades - a.unidades).slice(0, 10);

      // Combinar ticket promedio como promedio ponderado
      const totalFacturado = allCharts.reduce((a, c) => a + (c.facturacionHoy || 0), 0);
      const ticketPromedio = allCharts.reduce((a, c) => a + (c.ticketPromedio || 0), 0) / allCharts.length;
      const ticketAnterior = allCharts.reduce((a, c) => a + (c.ticketAnterior || 0), 0) / allCharts.length;

      return {
        week,
        month: (() => {
          const base = Array.from({length:30}, (_, i) => ({ day:`${i+1}`, actual:0, anterior:0 }));
          allCharts.forEach(c => {
            (c.month || []).forEach((d, i) => {
              if (base[i]) { base[i].actual += d.actual || 0; base[i].anterior += d.anterior || 0; }
            });
          });
          return base;
        })(),
        year: (() => {
          const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
          const base = meses.map(mes => ({ mes, actual:0, anterior:0 }));
          allCharts.forEach(c => {
            (c.year || []).forEach((d, i) => {
              if (base[i]) { base[i].actual += d.actual || 0; base[i].anterior += d.anterior || 0; }
            });
          });
          return base;
        })(),
        topProducts,
        facturacionHoy: allCharts.reduce((a, c) => a + (c.facturacionHoy || 0), 0),
        facturacionAyer: allCharts.reduce((a, c) => a + (c.facturacionAyer || 0), 0),
        ticketPromedio,
        ticketAnterior,
      };
    }
    return s.charts[s.branchId] || { week:[], month:[], year:[], topProducts:[], facturacionHoy:0, facturacionAyer:0, ticketPromedio:0, ticketAnterior:0 };
  };

  const getReservas = () => {
    if (!s.branchId) return [];
    if (s.branchId === 'todas')
      return Object.entries(s.reservas).flatMap(([bid, rs]) => (rs||[]).map(r => ({ ...r, sucursalNombre: s.sucursales.find(su => su.id === bid)?.nombre })));
    return s.reservas[s.branchId] || [];
  };
  const getStock = () => {
    if (!s.branchId) return [];
    if (s.branchId === 'todas')
      return Object.entries(s.stock).flatMap(([bid, items]) => (items||[]).map(i => ({ ...i, sucursalNombre: s.sucursales.find(su => su.id === bid)?.nombre, sucursalId: bid })));
    return s.stock[s.branchId] || [];
  };
  const getActivity = () => {
    if (!s.branchId) return [];
    if (s.branchId === 'todas')
      return Object.values(s.activity).flat().sort((a,b) => b.ts - a.ts);
    return s.activity[s.branchId] || [];
  };
  const getTables = (bid) => s.tables[bid] || [];
  const getActiveBranch = () => s.sucursales.find(su => su.id === s.branchId);

  // â”€â”€ Helper: normalizar timestamps de base44 (puede venir como ms, segundos o ISO string)
  const normTs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'string') {
      // ISO string "2026-05-07T00:00:00.000Z"
      const d = new Date(ts);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    const n = Number(ts);
    // Si es menor a aÃ±o 2000 en ms, probablemente son segundos
    if (n < 9_000_000_000) return n * 1000;
    return n;
  };

  const refreshCharts = useCallback(async (branchIdOverride) => {
    const activeBranch = branchIdOverride !== undefined ? branchIdOverride : s.branchId;
    if (!s.sucursales || s.sucursales.length === 0) return;
    const targetBranchIds = activeBranch === 'todas' || !activeBranch
      ? s.sucursales.map(b => b.id)
      : [activeBranch];

    // Calcular rangos de tiempo (siempre frescos en cada llamada)
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
    const T0 = startOfToday.getTime();
    const T_AYER = T0 - 86400000;
    const T_SEMANA = T0 - 7 * 86400000;
    const T_MES = T0 - 30 * 86400000;
    const T_ANIO = T0 - 365 * 86400000;
    const DAY_MS = 86400000;
    const dayNames = ['lun','mar','mié','jue','vie','sáb','dom'];
    const mesNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    // Lunes de esta semana y anterior
    const lunesEsta = T0 - (((startOfToday.getDay() + 6) % 7) * DAY_MS);
    const lunesAnt  = lunesEsta - 7 * DAY_MS;

    try {
      // Traer mÃ¡s turnos para tener datos histÃ³ricos completos (2000 en lugar de 500)
      const closedArrays = await Promise.all(
        targetBranchIds.map(bid =>
          fetchClosedTurnsPaginated(bid, new Date(new Date().getFullYear(), 0, 1).toISOString(), new Date().toISOString(), 500).catch(() => [])
        )
      );
      const filtered = closedArrays.flat()
        .filter(t => t.status !== 'anulada')
        .map(t => ({ ...t, _ts: normTs(t.closed_at) })); // normalizar timestamps una sola vez

      const newCharts = {};
      for (const bid of targetBranchIds) {
        const bTurns = filtered.filter(t => t.branch_id === bid);

        // Filtros con timestamps normalizados
        const todayTurns     = bTurns.filter(t => t._ts >= T0);
        const ayerTurns      = bTurns.filter(t => t._ts >= T_AYER && t._ts < T0);
        const semanaTurns    = bTurns.filter(t => t._ts >= T_SEMANA);
        const mesTurns       = bTurns.filter(t => t._ts >= T_MES);

        const facturacionHoy  = todayTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
        const facturacionAyer = ayerTurns.reduce((a,t)  => a + (t.total_facturado||0), 0);
        const ticketPromedio  = todayTurns.length > 0 ? Math.round(facturacionHoy / todayTurns.length) : 0;
        const ticketAnterior  = ayerTurns.length  > 0 ? Math.round(facturacionAyer / ayerTurns.length) : 0;

        // â”€â”€ GrÃ¡fico semanal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const weekData = dayNames.map((day, i) => {
          const ini = lunesEsta + i * DAY_MS;
          const fin = ini + DAY_MS;
          const iniA = lunesAnt + i * DAY_MS;
          const finA = iniA + DAY_MS;
          const actual   = bTurns.filter(t => t._ts >= ini  && t._ts < fin ).reduce((a,t) => a+(t.total_facturado||0), 0);
          const anterior = bTurns.filter(t => t._ts >= iniA && t._ts < finA).reduce((a,t) => a+(t.total_facturado||0), 0);
          return { day, actual, anterior };
        });

        // â”€â”€ GrÃ¡fico mensual (Ãºltimos 30 dÃ­as vs 30 dÃ­as anteriores) â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const monthData = Array.from({length:30}, (_, i) => {
          const ini  = T_MES + i * DAY_MS;
          const fin  = ini + DAY_MS;
          const iniA = ini - 30 * DAY_MS;
          const finA = iniA + DAY_MS;
          const actual   = bTurns.filter(t => t._ts >= ini  && t._ts < fin ).reduce((a,t) => a+(t.total_facturado||0), 0);
          const anterior = bTurns.filter(t => t._ts >= iniA && t._ts < finA).reduce((a,t) => a+(t.total_facturado||0), 0);
          return { day: String(i+1), actual, anterior };
        });

        // â”€â”€ GrÃ¡fico anual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const yearData = mesNames.map((mes, i) => {
          const year = now.getFullYear();
          const iniMes  = new Date(year, i, 1).getTime();
          const finMes  = new Date(year, i+1, 1).getTime();
          const iniMesA = new Date(year-1, i, 1).getTime();
          const finMesA = new Date(year-1, i+1, 1).getTime();
          const actual   = bTurns.filter(t => t._ts >= iniMes  && t._ts < finMes ).reduce((a,t) => a+(t.total_facturado||0), 0);
          const anterior = bTurns.filter(t => t._ts >= iniMesA && t._ts < finMesA).reduce((a,t) => a+(t.total_facturado||0), 0);
          return { mes, actual, anterior };
        });

        // â”€â”€ Top productos (Ãºltimos 7 dÃ­as, batch de hasta 100 turnos) â”€â”€â”€â”€â”€â”€â”€â”€
        let topProducts = [];
        try {
          const { data: tpData } = await supabase.rpc('get_top_products', {
            p_branch_id: bid,
            p_desde: new Date(T_SEMANA).toISOString(),
            p_hasta: new Date().toISOString(),
            p_limit: 5,
          });
          topProducts = (tpData || []).map(p => ({ nombre: p.nombre, unidades: Number(p.unidades), monto: Number(p.monto) }));
        } catch(e) {}

        newCharts[bid] = {
          week:weekData, month:monthData, year:yearData,
          facturacionHoy, facturacionAyer, ticketPromedio, ticketAnterior, topProducts,
        };
      }

      // Actividad reciente
      const newActivity = {};
      for (const bid of targetBranchIds) {
        const sorted = filtered
          .filter(t => t.branch_id === bid)
          .sort((a,b) => (b._ts||0) - (a._ts||0))
          .slice(0, 8);
        newActivity[bid] = sorted.map(t => ({
          id: t.id,
          texto: `Mesa ${t.mesa_num} cerrada â€” $${(t.total_facturado||0).toLocaleString('es-AR')}`,
          ts: t._ts || Date.now(),
          color: '#1D9E75',
        }));
      }

      setS(prev => ({
        ...prev,
        charts: { ...prev.charts, ...newCharts },
        activity: { ...prev.activity, ...newActivity },
        closedTurns: filtered.slice(0, 500),
      }));
    } catch(err) {
      console.error('Error refreshCharts:', err);
    }
  }, [s.branchId, s.sucursales]);


  // ── refreshChartsForRange: carga datos para cualquier rango de fechas ────────
  // startTs y endTs son timestamps en ms (Date.getTime())
  // Compara con el mismo período anterior (mismo número de días)
  const refreshChartsForRange = useCallback(async (startTs, endTs, branchIdOverride) => {
    const activeBranch = branchIdOverride !== undefined ? branchIdOverride : s.branchId;
    if (!s.sucursales || s.sucursales.length === 0) return;
    const targetBranchIds = activeBranch === 'todas' || !activeBranch
      ? s.sucursales.map(b => b.id)
      : [activeBranch];

    const rangeDuration = endTs - startTs;
    const prevStartTs = startTs - rangeDuration;
    const prevEndTs   = startTs;
    const DAY_MS = 86400000;
    const totalDays = Math.max(1, Math.ceil(rangeDuration / DAY_MS));

    try {
      const closedArrays = await Promise.all(
        targetBranchIds.map(bid =>
          fetchClosedTurnsPaginated(bid, new Date(new Date().getFullYear(), 0, 1).toISOString(), new Date().toISOString(), 500).catch(() => [])
        )
      );
      const allTurns = closedArrays.flat()
        .filter(t => t.status !== 'anulada')
        .map(t => ({ ...t, _ts: normTs(t.closed_at) }));

      const newCharts = {};
      for (const bid of targetBranchIds) {
        const bTurns = allTurns.filter(t => t.branch_id === bid);

        // Datos del rango seleccionado
        const rangeTurns = bTurns.filter(t => t._ts >= startTs && t._ts < endTs);
        const prevTurns  = bTurns.filter(t => t._ts >= prevStartTs && t._ts < prevEndTs);

        const facturacionHoy  = rangeTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
        const facturacionAyer = prevTurns.reduce((a,t)  => a + (t.total_facturado||0), 0);
        const ticketPromedio  = rangeTurns.length > 0 ? Math.round(facturacionHoy / rangeTurns.length) : 0;
        const ticketAnterior  = prevTurns.length  > 0 ? Math.round(facturacionAyer / prevTurns.length) : 0;

        // Gráfico día a día para el rango seleccionado
        const dayNames = ['dom','lun','mar','mié','jue','vie','sáb'];
        const weekData = Array.from({ length: totalDays }, (_, i) => {
          const ini   = startTs + i * DAY_MS;
          const fin   = ini + DAY_MS;
          const iniP  = prevStartTs + i * DAY_MS;
          const finP  = iniP + DAY_MS;
          const d     = new Date(ini);
          const label = totalDays <= 31
            ? (totalDays <= 7 ? dayNames[d.getDay()] : `${d.getDate()}/${d.getMonth()+1}`)
            : ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];
          const actual   = rangeTurns.filter(t => t._ts >= ini  && t._ts < fin ).reduce((a,t) => a+(t.total_facturado||0), 0);
          const anterior = prevTurns.filter(t  => t._ts >= iniP && t._ts < finP).reduce((a,t) => a+(t.total_facturado||0), 0);
          return { day: label, actual, anterior };
        });

        // Top productos del rango (1 sola query SQL)
        let topProducts = [];
        try {
          const { data: tpData } = await supabase.rpc('get_top_products', {
            p_branch_id: bid,
            p_desde: new Date(startTs).toISOString(),
            p_hasta: new Date(endTs).toISOString(),
            p_limit: 5,
          });
          topProducts = (tpData || []).map(p => ({ nombre: p.nombre, unidades: Number(p.unidades), monto: Number(p.monto) }));
        } catch(e) {}
        // topProducts ya calculado por RPC arriba

        // Actividad reciente
        const sorted = bTurns.sort((a,b) => (b._ts||0) - (a._ts||0)).slice(0, 8);
        const activity = sorted.map(t => ({
          id: t.id,
          texto: `Mesa ${t.mesa_num} cerrada — $${(t.total_facturado||0).toLocaleString('es-AR')}`,
          ts: t._ts || Date.now(),
          color: '#1D9E75',
        }));

        newCharts[bid] = {
          week: weekData, month: weekData, year: weekData,
          facturacionHoy, facturacionAyer, ticketPromedio, ticketAnterior, topProducts,
          rangeStartTs: startTs, rangeEndTs: endTs,
        };

        // activity separada
        setS(prev => ({
          ...prev,
          activity: { ...prev.activity, [bid]: activity },
        }));
      }

      setS(prev => ({
        ...prev,
        charts: { ...prev.charts, ...newCharts },
        closedTurns: allTurns.slice(0, 500),
      }));
    } catch(err) {
      console.error('Error refreshChartsForRange:', err);
    }
  }, [s.branchId, s.sucursales]);

  const setClosedTurns = (turns) => setS(p => ({ ...p, closedTurns: turns }));

  const setTurnoActivo = (turno) => setS(p => ({ ...p, turnoActivo: turno }));
  const addTeamMember = (member) => setS(p => ({ ...p, teamMembers: [...(p.teamMembers||[]), member] }));
  const removeTeamMember = (id) => setS(p => ({ ...p, teamMembers: (p.teamMembers||[]).filter(m => m.id !== id) }));

  const logAccion = ({ usuario, rol, categoria, accion, detalle, sucursal }) => {
    const ts = Date.now();
    const d = new Date(ts);
    const fecha = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    setS(p => {
      const restaurantId = p.restaurantId;
      const branchId = p.branchId !== 'todas' ? p.branchId : null;
      const localId = 'local_' + ts + '_' + Math.random().toString(36).slice(2,7);
      const localEntry = { id: localId, fecha, usuario: usuario || 'Sistema', accion, entidad: categoria, detalle: detalle || '', sucursal: sucursal || '', ts };
      if (restaurantId) {
        base44.entities.AuditLog.create({
          restaurant_id: restaurantId,
          branch_id: branchId || '',
          usuario_email: usuario || 'Sistema',
          usuario_rol: rol || '',
          categoria: categoria || '',
          accion,
          detalle: detalle || '',
          sucursal_nombre: sucursal || '',
          ts: new Date().toISOString(),
        }).catch(() => {});
      }
      return { ...p, auditoria: [localEntry, ...(p.auditoria||[])].slice(0, 100) };
    });
  };
  const addRetiro = (retiro) => setS(p => p.turnoActivo ? ({ ...p, turnoActivo: { ...p.turnoActivo, retiros: [...(p.turnoActivo.retiros||[]), retiro] } }) : p);
  const cerrarTurnoActivo = () => setS(p => ({ ...p, turnoActivo: null }));
  const completeOnboarding = () => setS(p => ({ ...p, needsOnboarding: false }));

  const getMenuItems = (branchId) => s.menuItems[branchId] || [];

  const ctx = {
    ...s, setBranchId, updateRestaurante,
    openTable, closeTable, openTableWithTurn, setTableTurnId, setTableComandaLista, setOrderItemTurnItemId,
    updateTableOrder, saveLayout,
    addReservation, updateReservation,
    addStockItem, updateStockItem, deleteStockItem,
    addMenuItem, updateMenuItem, deleteMenuItem, setMenuItems, getMenuItems,
    updateSucursal, addEquipo,
    getCharts, getReservas, getStock, getActivity, getTables, getActiveBranch,
    refreshCharts, refreshChartsForRange, setClosedTurns,
    setTurnoActivo, addRetiro, cerrarTurnoActivo,
    addTeamMember, removeTeamMember,
    logAccion,
    completeOnboarding,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export const useStore = () => useContext(AppContext);



