// lib/storeSelectors.js
// Selectores específicos del store para evitar re-renders innecesarios.
// En vez de useStore() que devuelve TODO, estos hooks devuelven
// solo las propiedades que necesita cada componente.

import { useStore } from '@/lib/store';

// ── POS View ──────────────────────────────────────────────────
export function usePOSStore() {
  const store = useStore();
  return {
    branchId:       store.branchId,
    sucursales:     store.sucursales,
    restaurante:    store.restaurante,
    turnoActivo:    store.turnoActivo,
    getMenuItems:   store.getMenuItems,
    getTables:      store.getTables,
    closeTable:     store.closeTable,
    setTurnoActivo: store.setTurnoActivo,
    refreshCharts:  store.refreshCharts,
    logAccion:      store.logAccion,
  };
}

// ── Dashboard ─────────────────────────────────────────────────
export function useDashboardStore() {
  const store = useStore();
  return {
    branchId:               store.branchId,
    sucursales:             store.sucursales,
    closedTurns:            store.closedTurns,
    tables:                 store.tables,
    getCharts:              store.getCharts,
    getActivity:            store.getActivity,
    refreshCharts:          store.refreshCharts,
    refreshChartsForRange:  store.refreshChartsForRange,
  };
}

// ── Salón ─────────────────────────────────────────────────────
export function useSalonStore() {
  const store = useStore();
  return {
    branchId:           store.branchId,
    sucursales:         store.sucursales,
    teamMembers:        store.teamMembers,
    gridConfig:         store.gridConfig,
    getTables:          store.getTables,
    openTable:          store.openTable,
    openTableWithTurn:  store.openTableWithTurn,
    setTableTurnId:     store.setTableTurnId,
    setTableComandaLista: store.setTableComandaLista,
    logAccion:          store.logAccion,
  };
}

// ── Stock ─────────────────────────────────────────────────────
export function useStockStore() {
  const store = useStore();
  return {
    branchId:       store.branchId,
    sucursales:     store.sucursales,
    getMenuItems:   store.getMenuItems,
    addMenuItem:    store.addMenuItem,
    updateMenuItem: store.updateMenuItem,
    deleteMenuItem: store.deleteMenuItem,
    reloadMenu:     store.reloadMenu,
    logAccion:      store.logAccion,
  };
}

// ── Caja ─────────────────────────────────────────────────────
export function useCajaStore() {
  const store = useStore();
  return {
    branchId:       store.branchId,
    sucursales:     store.sucursales,
    turnoActivo:    store.turnoActivo,
    closedTurns:    store.closedTurns,
    setTurnoActivo: store.setTurnoActivo,
    setClosedTurns: store.setClosedTurns,
    logAccion:      store.logAccion,
  };
}

// ── Genérico para componentes pequeños ───────────────────────
export function useBranchStore() {
  const store = useStore();
  return {
    branchId:   store.branchId,
    sucursales: store.sucursales,
    restaurante: store.restaurante,
  };
}
