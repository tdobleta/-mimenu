import { useState, useEffect } from 'react';
import { BP } from '@/lib/glass';

// ── useBreakpoint ────────────────────────────────────────────────────────────
// Devuelve el breakpoint actual: 'sm' | 'md' | 'lg' | 'xl'
// Basado en los breakpoints de glass.js (alineados con Tailwind).

function getBreakpoint(w) {
  if (w >= BP.xl) return 'xl';
  if (w >= BP.lg) return 'lg';
  if (w >= BP.md) return 'md';
  return 'sm';
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'lg'
  );

  useEffect(() => {
    let raf;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBp(getBreakpoint(window.innerWidth)));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return bp;
}

// ── useIsMobile ──────────────────────────────────────────────────────────────
// Backward-compatible: <768px = mobile (phone / tablet portrait estrecho)
export function useIsMobile() {
  const bp = useBreakpoint();
  return bp === 'sm';
}

// ── useIsPortrait ────────────────────────────────────────────────────────────
// Detecta orientación portrait (más alto que ancho)
export function useIsPortrait() {
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(mql.matches);
    mql.addEventListener('change', onChange);
    setPortrait(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return portrait;
}
