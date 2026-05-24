// lib/useActiveStaff.js
// Hook para el sistema de PIN de mozos en tablets compartidas.
//
// Arquitectura:
//   - La tablet tiene UNA sesión Supabase (dueño/encargado).
//   - Cada mozo se identifica con nombre + PIN 4 dígitos encima de esa sesión.
//   - activeStaff se guarda en localStorage con TTL de 2h de inactividad.
//   - Al expirar, PinGuard muestra la pantalla de selección automáticamente.
//
// Estructura de activeStaff en localStorage:
//   { id, nombre, rol, branchId, loginAt, lastActivityAt }

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'mimenu_active_staff';
const INACTIVITY_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Verificar expiración por inactividad
    if (Date.now() - parsed.lastActivityAt > INACTIVITY_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(staff) {
  if (!staff) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
}

// Actualiza lastActivityAt para resetear el TTL con cada acción
export function touchActiveStaff() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.lastActivityAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}

// Retorna { id, nombre, rol } del staff activo, o null si no hay ninguno activo.
// Uso rápido sin hook React (para attribution en funciones async).
export function getActiveStaff() {
  return readStored();
}

// Hook React completo
export function useActiveStaff() {
  const [activeStaff, setActiveStaffState] = useState(() => readStored());

  // Verificar expiración cada 60s
  useEffect(() => {
    const iv = setInterval(() => {
      const current = readStored();
      setActiveStaffState(prev => {
        if (prev?.id !== current?.id) return current;
        return prev;
      });
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  const setActiveStaff = useCallback((staff) => {
    const enriched = staff ? {
      ...staff,
      loginAt:          Date.now(),
      lastActivityAt:   Date.now(),
    } : null;
    writeStored(enriched);
    setActiveStaffState(enriched);
  }, []);

  const clearActiveStaff = useCallback(() => {
    writeStored(null);
    setActiveStaffState(null);
  }, []);

  return { activeStaff, setActiveStaff, clearActiveStaff };
}
