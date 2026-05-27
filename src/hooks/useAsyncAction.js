import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/lib/toast';
import { getUserErrorMessage } from '@/lib/errorMessages';

/**
 * Hook para wrappear acciones async con try/catch/toast automático.
 *
 * @param {Function} fn - Función async a ejecutar
 * @param {Object} opts
 * @param {string} [opts.successMsg] - Mensaje de éxito (toast success)
 * @param {string} [opts.errorMsg]   - Override del mensaje de error
 * @param {boolean} [opts.silent]    - true = no mostrar toast en error
 *
 * @returns {[Function, { loading: boolean, error: string|null }]}
 *
 * Ejemplo:
 *   const [save, { loading }] = useAsyncAction(
 *     async (data) => { await supabase.from('items').insert(data); },
 *     { successMsg: 'Guardado' }
 *   );
 */
export function useAsyncAction(fn, opts = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const mountedRef = useRef(true);

  // Cleanup on unmount.
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(...args);
        if (mountedRef.current) {
          setLoading(false);
          if (opts.successMsg && toast?.addToast) {
            toast.addToast(opts.successMsg, 'success');
          }
        }
        return result;
      } catch (err) {
        if (mountedRef.current) {
          const msg = opts.errorMsg || getUserErrorMessage(err);
          setError(msg);
          setLoading(false);
          if (!opts.silent && toast?.addToast) {
            toast.addToast(msg, 'error');
          }
        }
        throw err; // Re-throw para que el caller pueda manejar si quiere
      }
    },
    [fn, opts.successMsg, opts.errorMsg, opts.silent, toast]
  );

  return [execute, { loading, error }];
}
