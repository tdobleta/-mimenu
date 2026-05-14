// lib/toast.jsx
// Sistema de toast unificado usando Sonner.
// Mantiene la misma API (useToast + addToast) para no romper
// ningún componente existente.
import { createContext, useContext, useCallback } from 'react';
import { toast } from 'sonner';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const addToast = useCallback((message, type = 'success') => {
    switch (type) {
      case 'error':   toast.error(message);   break;
      case 'warning': toast.warning(message); break;
      case 'info':    toast.info(message);    break;
      default:        toast.success(message); break;
    }
  }, []);

  return (
    <ToastCtx.Provider value={{ addToast }}>
      {children}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
