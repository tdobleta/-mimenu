// ── Test: Sidebar mode filtering ─────────────────────────────────────
// Pure logic tests — validate that device mode filtering reduces
// visible navigation without expanding what the role allows.
// No DOM rendering needed: we replicate the two-filter chain on the
// same constants the Sidebar uses.

import { describe, it, expect } from 'vitest';
import { VALID_MODES } from '@/lib/DeviceModeContext';
import { MODE_PATHS } from '@/components/Sidebar';

// ── Replicate Sidebar constants for testing ──────────────────────────
// These mirror the actual NAV and ROLE_PATHS from Sidebar.jsx.
// We only need the paths for filtering logic tests.

const NAV_PATHS = [
  '/', '/salon', '/caja', '/reservas', '/stock', '/clientes',
  '/delivery', '/reportes', '/analiticas', '/conexion',
  '/configuracion', '/control-cocina', '/cocina',
];

const ROLE_PATHS = {
  Dueno:     ['/', '/salon', '/caja', '/reservas', '/stock', '/clientes', '/delivery', '/reportes', '/analiticas', '/conexion', '/configuracion', '/control-cocina', '/cocina'],
  Encargado: ['/', '/salon', '/caja', '/reservas', '/stock', '/clientes', '/delivery', '/reportes', '/analiticas', '/conexion', '/control-cocina', '/cocina'],
  Mozo:      ['/salon', '/reservas', '/delivery'],
  Cocinero:  [],
};

// ── Replicate the exact filtering logic from Sidebar.jsx ─────────────
function getVisiblePaths(role, mode) {
  const allowed = ROLE_PATHS[role] || [];
  const modePaths = (mode && MODE_PATHS.hasOwnProperty(mode)) ? MODE_PATHS[mode] : null;
  return NAV_PATHS
    .filter(p => allowed.includes(p))
    .filter(p => modePaths === null || modePaths.includes(p));
}

// ── Contract tests ───────────────────────────────────────────────────

describe('MODE_PATHS contract', () => {
  it('every VALID_MODE has an entry in MODE_PATHS', () => {
    for (const mode of VALID_MODES) {
      expect(MODE_PATHS.hasOwnProperty(mode)).toBe(true);
    }
  });

  it('MODE_PATHS.admin is null (no filtering)', () => {
    expect(MODE_PATHS.admin).toBeNull();
  });

  it('MODE_PATHS has no extra keys beyond VALID_MODES', () => {
    const keys = Object.keys(MODE_PATHS);
    expect(keys.sort()).toEqual([...VALID_MODES].sort());
  });

  it('non-null MODE_PATHS values are arrays of strings', () => {
    for (const [mode, paths] of Object.entries(MODE_PATHS)) {
      if (paths === null) continue;
      expect(Array.isArray(paths)).toBe(true);
      for (const p of paths) {
        expect(typeof p).toBe('string');
        expect(p.startsWith('/')).toBe(true);
      }
    }
  });

  it('every path in MODE_PATHS exists in NAV_PATHS', () => {
    for (const [mode, paths] of Object.entries(MODE_PATHS)) {
      if (paths === null) continue;
      for (const p of paths) {
        expect(NAV_PATHS).toContain(p);
      }
    }
  });
});

// ── Filtering logic tests ────────────────────────────────────────────

describe('Sidebar mode filtering — admin mode', () => {
  it('admin + Dueno = all Dueno paths (no filtering)', () => {
    const result = getVisiblePaths('Dueno', 'admin');
    expect(result).toEqual(ROLE_PATHS.Dueno);
  });

  it('admin + Mozo = all Mozo paths (no filtering, role limits)', () => {
    const result = getVisiblePaths('Mozo', 'admin');
    expect(result).toEqual(ROLE_PATHS.Mozo);
  });
});

describe('Sidebar mode filtering — cashier mode', () => {
  it('cashier + Dueno = [/caja, /salon]', () => {
    const result = getVisiblePaths('Dueno', 'cashier');
    expect(result).toEqual(['/salon', '/caja']);
  });

  it('cashier + Mozo = [/salon] only (role blocks /caja)', () => {
    const result = getVisiblePaths('Mozo', 'cashier');
    expect(result).toEqual(['/salon']);
  });
});

describe('Sidebar mode filtering — pos mode', () => {
  it('pos + Dueno = [/salon, /reservas, /delivery]', () => {
    const result = getVisiblePaths('Dueno', 'pos');
    expect(result).toEqual(['/salon', '/reservas', '/delivery']);
  });

  it('pos + Mozo = [/salon, /reservas, /delivery] (same as Mozo role)', () => {
    const result = getVisiblePaths('Mozo', 'pos');
    expect(result).toEqual(['/salon', '/reservas', '/delivery']);
  });
});

describe('Sidebar mode filtering — stock mode', () => {
  it('stock + Dueno = [/stock]', () => {
    const result = getVisiblePaths('Dueno', 'stock');
    expect(result).toEqual(['/stock']);
  });

  it('stock + Mozo = [] (role blocks /stock)', () => {
    const result = getVisiblePaths('Mozo', 'stock');
    expect(result).toEqual([]);
  });
});

describe('Sidebar mode filtering — kds mode', () => {
  it('kds + Dueno = [] (sidebar never renders for kds)', () => {
    const result = getVisiblePaths('Dueno', 'kds');
    expect(result).toEqual([]);
  });

  it('kds + Mozo = []', () => {
    const result = getVisiblePaths('Mozo', 'kds');
    expect(result).toEqual([]);
  });
});

describe('Sidebar mode filtering — null/missing mode', () => {
  it('null mode + Dueno = all Dueno paths (no filtering)', () => {
    const result = getVisiblePaths('Dueno', null);
    expect(result).toEqual(ROLE_PATHS.Dueno);
  });

  it('undefined mode + Dueno = all Dueno paths (no filtering)', () => {
    const result = getVisiblePaths('Dueno', undefined);
    expect(result).toEqual(ROLE_PATHS.Dueno);
  });
});

describe('Sidebar mode filtering — unknown/null role gets no nav', () => {
  it('unknown role "Cajero" + admin mode → empty', () => {
    expect(getVisiblePaths('Cajero', 'admin')).toEqual([]);
  });

  it('null role + admin mode → empty', () => {
    expect(getVisiblePaths(null, 'admin')).toEqual([]);
  });

  it('undefined role + cashier mode → empty', () => {
    expect(getVisiblePaths(undefined, 'cashier')).toEqual([]);
  });
});

describe('Sidebar mode filtering — mode never expands role', () => {
  it('no mode+role combination produces paths outside ROLE_PATHS[role]', () => {
    for (const role of Object.keys(ROLE_PATHS)) {
      const roleAllowed = ROLE_PATHS[role];
      for (const mode of VALID_MODES) {
        const result = getVisiblePaths(role, mode);
        for (const p of result) {
          expect(roleAllowed).toContain(p);
        }
      }
    }
  });

  it('mode filtering always produces a subset of role-allowed paths', () => {
    for (const role of Object.keys(ROLE_PATHS)) {
      const roleAllowed = getVisiblePaths(role, 'admin');
      for (const mode of VALID_MODES) {
        const result = getVisiblePaths(role, mode);
        expect(result.length).toBeLessThanOrEqual(roleAllowed.length);
      }
    }
  });
});
