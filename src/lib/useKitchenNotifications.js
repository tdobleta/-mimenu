// useKitchenNotifications.js
// Escucha en tiempo real cuando cocina marca una comanda como lista
// y genera notificaciones para mozos y encargados.
// v2 — con sonido de alerta y sin localStorage

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';

// ── Sonido de alerta generado con Web Audio API ──────────────
// No requiere archivo de audio externo
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Dos beeps cortos
    const beep = (startTime, freq = 880, duration = 0.12) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    };

    const now = ctx.currentTime;
    beep(now, 880, 0.12);
    beep(now + 0.18, 1100, 0.18);
    beep(now + 0.42, 880, 0.12);
  } catch {
    // Web Audio no disponible — sin sonido pero no rompe
  }
}

export function useKitchenNotifications() {
  const store = useStore();
  const activeBranchId = store.branchId !== 'todas' ? store.branchId : store.sucursales?.[0]?.id;
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const channelRef = useRef(null);

  // Contar no leídas
  useEffect(() => {
    setUnread(notifs.filter(n => !n.read).length);
  }, [notifs]);

  const addNotif = useCallback((turn) => {
    const notif = {
      id: `notif_${turn.id}_${Date.now()}`,
      turnId: turn.id,
      mesa: turn.mesa_num,
      mozo: turn.mozo || '',
      ts: Date.now(),
      read: false,
      tipo: 'cocina_lista',
      mensaje: `Mesa ${turn.mesa_num} lista para servir`,
    };

    setNotifs(prev => {
      // Evitar duplicados dentro de 2 minutos
      if (prev.find(n => n.turnId === turn.id && Date.now() - n.ts < 120000)) return prev;
      return [notif, ...prev];
    });

    // Sonido de alerta
    playAlertSound();

    // Vibración en dispositivos que lo soporten (tablets Android)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // Notificación del browser si tiene permiso
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🍽 Mesa ${turn.mesa_num} lista`, {
        body: `${turn.mozo ? `Mozo: ${turn.mozo} · ` : ''}El pedido está listo para servir`,
        icon: '/favicon.svg',
        tag: `mesa_${turn.id}`,
      });
    }
  }, []);

  // Suscripción Supabase Realtime
  useEffect(() => {
    if (!activeBranchId) return;

    // Pedir permiso de notificaciones del browser
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const channel = supabase
      .channel(`kitchen_notifs_${activeBranchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'turns',
          filter: `branch_id=eq.${activeBranchId}`,
        },
        (payload) => {
          const turn = payload.new;
          // Solo cuando comanda_lista cambia a true
          if (turn.comanda_lista === true && payload.old?.comanda_lista !== true) {
            addNotif(turn);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [activeBranchId, addNotif]);

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  function markRead(id) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function clearAll() {
    setNotifs([]);
  }

  return { notifs, unread, markAllRead, markRead, clearAll };
}
