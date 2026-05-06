import { supabase } from "@/api/supabaseClient";
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

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
    egresos: {},
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

  useEffect(() => {
    async function init() {
      try {
        const user = await base44.auth.me();
        if (!user) {
          // No hay sesión — AuthContext se encarga de redirigir al login
          return;
        }
        // Intentar por owner_id primero (más preciso), luego por email
        let restaurants = await base44.entities.Restaurant.filter({ owner_id: user.id });
        if (!restaurants || restaurants.length === 0) {
          restaurants = await base44.entities.Restaurant.filter({ owner_email: user.email });
        }

        let memberships = [];
        try {
          const byEmail = await base44.entities.TeamMember.filter({ email: user.email }).catch(() => []);
          memberships = (byEmail || []).filter(m => m.email === user.email);
        } catch(e) {}

        // Solo reintentar si hay un restaurante incompleto — posible usuario invitado
        // en su primer login. Para dueños nuevos no hay reintento.
        if (memberships.length === 0 && restaurants && restaurants.length > 0 && !restaurants[0]?.onboarding_completado) {
          await new Promise(res => setTimeout(res, 1200));
          try {
            const byEmail2 = await base44.entities.TeamMember.filter({ email: user.email }).catch(() => []);
            memberships = (byEmail2 || []).filter(m => m.email === user.email);
          } catch(e) {}
        }

        let restaurant;

        if (restaurants && restaurants.length > 0 && restaurants[0].onboarding_completado) {
          // Dueño con onboarding completo — es el dueño del restaurante
          restaurant = restaurants[0];
        } else if (memberships.length > 0) {
          // Es miembro de equipo — cargar el restaurante al que pertenece
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
          // Tiene restaurante propio sin completar — continuar onboarding
          restaurant = restaurants[0];
        } else {
          // Usuario genuinamente nuevo — crear restaurante y arrancar onboarding
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
            // Reconstruir totalCache desde Turns reales para que el número en pantalla sea correcto
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
            const itemArrays = await Promise.all(
              openTurns.map(turn =>
                base44.entities.TurnItem.filter({ turn_id: turn.id }).catch(() => [])
              )
            );
            openTurns.forEach((turn, idx) => {
              const items = itemArrays[idx] || [];
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
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) init();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) init();
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
    // Solo recargar si no tenemos los ítems de esa branch todavía
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

  const refreshCharts = useCallback(async (branchIdOverride) => {
    const activeBranch = branchIdOverride !== undefined ? branchIdOverride : s.branchId;
    if (!s.sucursales || s.sucursales.length === 0) return;
    const targetBranchIds = activeBranch === 'todas' || !activeBranch
      ? s.sucursales.map(b => b.id)
      : [activeBranch];

    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const startOfYesterday = startOfToday.getTime() - 24*60*60*1000;
    const startOfWeek = startOfToday.getTime() - 7*24*60*60*1000;

    try {
      const closedArrays = await Promise.all(
        targetBranchIds.map(bid =>
          base44.entities.Turn.filter({ status: 'cerrada', branch_id: bid }, '-closed_at', 500).catch(() => [])
        )
      );
      const filtered = closedArrays.flat().filter(t => t.status !== 'anulada');

      const newCharts = {};
      for (const bid of targetBranchIds) {
        const branchTurns = filtered.filter(t => t.branch_id === bid);
        const todayTurns = branchTurns.filter(t => t.closed_at >= startOfToday.getTime());
        const yesterdayTurns = branchTurns.filter(t => t.closed_at >= startOfYesterday && t.closed_at < startOfToday.getTime());
        const weekTurns = branchTurns.filter(t => t.closed_at >= startOfWeek);

        const facturacionHoy = todayTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
        const facturacionAyer = yesterdayTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
        const ticketPromedio = todayTurns.length > 0 ? facturacionHoy / todayTurns.length : 0;
        const ticketAnterior = yesterdayTurns.length > 0 ? facturacionAyer / yesterdayTurns.length : 0;

        const dayNames = ['lun','mar','mié','jue','vie','sáb','dom'];
        const DAY_MS = 24*60*60*1000;
        const lunesEsta = startOfToday.getTime() - (((startOfToday.getDay() + 6) % 7) * DAY_MS);
        const lunesAnterior = lunesEsta - 7 * DAY_MS;
        const weekData = dayNames.map((day, i) => {
          const inicioEsta = lunesEsta + i * DAY_MS;
          const finEsta = inicioEsta + DAY_MS;
          const inicioAnt = lunesAnterior + i * DAY_MS;
          const finAnt = inicioAnt + DAY_MS;
          const actual = branchTurns
            .filter(t => t.closed_at >= inicioEsta && t.closed_at < finEsta)
            .reduce((a,t) => a + (t.total_facturado||0), 0);
          const anterior = branchTurns
            .filter(t => t.closed_at >= inicioAnt && t.closed_at < finAnt)
            .reduce((a,t) => a + (t.total_facturado||0), 0);
          return { day, actual, anterior };
        });

        const productMap = {};
        try {
          const weekItemArrays = await Promise.all(
            weekTurns.map(turn =>
              base44.entities.TurnItem.filter({ turn_id: turn.id }).catch(() => [])
            )
          );
          weekItemArrays.flat().forEach(it => {
            const key = it.menu_item_name || 'Sin nombre';
            if (!productMap[key]) productMap[key] = { nombre: key, unidades: 0, monto: 0 };
            productMap[key].unidades += it.cantidad || 0;
            productMap[key].monto += (it.cantidad||0) * (it.precio||0);
          });
        } catch(e) {}
        const topProducts = Object.values(productMap).sort((a,b) => b.unidades - a.unidades).slice(0, 5);

        newCharts[bid] = {
          week: weekData,
          month: Array.from({length:30},(_,i)=>({ day:`${i+1}`, actual:0, anterior:0 })),
          year: ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].map(mes=>({mes,actual:0,anterior:0})),
          facturacionHoy, facturacionAyer, ticketPromedio, ticketAnterior, topProducts,
        };
      }

      // Construir actividad reciente por branch (últimos 8 cierres)
      const newActivity = {};
      for (const bid of targetBranchIds) {
        const sorted = filtered
          .filter(t => t.branch_id === bid)
          .sort((a,b) => (b.closed_at||0) - (a.closed_at||0))
          .slice(0, 8);
        newActivity[bid] = sorted.map(t => ({
          id: t.id,
          texto: `Mesa ${t.mesa_num} cerrada — $${(t.total_facturado||0).toLocaleString('es-AR')}`,
          ts: t.closed_at || Date.now(),
          color: '#1D9E75',
        }));
      }
      setS(prev => ({ ...prev, charts: { ...prev.charts, ...newCharts }, activity: { ...prev.activity, ...newActivity }, closedTurns: filtered }));
    } catch(err) {
      console.error('Error refreshCharts:', err);
    }
  }, [s.branchId, s.sucursales]);

  const setClosedTurns = (turns) => setS(p => ({ ...p, closedTurns: turns }));

  const setTurnoActivo = (turno) => setS(p => ({ ...p, turnoActivo: turno }));
  const addEgreso = (bid, egreso) => setS(p => ({ ...p, egresos: { ...p.egresos, [bid]: [...(p.egresos[bid]||[]), egreso] } }));
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
          ts,
        }).catch(() => {});
      }
      return { ...p, auditoria: [localEntry, ...(p.auditoria||[])] };
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
    refreshCharts, setClosedTurns,
    setTurnoActivo, addRetiro, cerrarTurnoActivo,
    addEgreso,
    addTeamMember, removeTeamMember,
    logAccion,
    completeOnboarding,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export const useStore = () => useContext(AppContext);


