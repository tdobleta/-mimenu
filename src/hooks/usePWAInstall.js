// hooks/usePWAInstall.js
// Captures the beforeinstallprompt event, detects standalone mode and iOS,
// and provides a dismiss cooldown via localStorage.
//
// This hook is consumed by PWAInstallPrompt in Layout.
// It does NOT render on /cocina, /pos, or public routes because those
// are outside <Layout />.

import { useState, useEffect, useCallback, useRef } from 'react';

const DISMISS_KEY = 'mimenu_pwa_install_dismissed';
const COOLDOWN_DAYS = 7;
const COOLDOWN_IOS_DAYS = 14;

function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPad/iPhone/iPod direct match
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch support
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS Safari standalone
  if (window.navigator.standalone === true) return true;
  // Chrome/Edge/Android standalone
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch { return false; }
}

function isDismissedWithinCooldown(isIOS) {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = new Date(raw).getTime();
    if (isNaN(dismissedAt)) return false;
    const cooldownMs = (isIOS ? COOLDOWN_IOS_DAYS : COOLDOWN_DAYS) * 86400000;
    return Date.now() - dismissedAt < cooldownMs;
  } catch { return false; }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => detectStandalone());
  const [dismissed, setDismissed] = useState(false);
  const isIOS = useRef(detectIOS()).current;

  useEffect(() => {
    // Check dismiss cooldown on mount
    if (isDismissedWithinCooldown(isIOS)) {
      setDismissed(true);
    }

    // Listen for standalone mode changes (e.g., user installs while page is open)
    let mq;
    try {
      mq = window.matchMedia('(display-mode: standalone)');
      const onStandaloneChange = (e) => {
        if (e.matches) setIsInstalled(true);
      };
      mq.addEventListener('change', onStandaloneChange);
      var cleanupMQ = () => mq.removeEventListener('change', onStandaloneChange);
    } catch {}

    // Capture beforeinstallprompt (Chrome/Edge/Android only)
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // Detect successful install
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      cleanupMQ?.();
    };
  }, [isIOS]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'dismissed';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()); } catch {}
    setDismissed(true);
  }, []);

  const canInstall = !!deferredPrompt && !isInstalled && !dismissed;
  const showIOSGuide = isIOS && !isInstalled && !dismissed;

  return { canInstall, isInstalled, isIOS, showIOSGuide, promptInstall, dismiss };
}
