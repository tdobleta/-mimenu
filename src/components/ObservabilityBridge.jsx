import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useStore } from '@/lib/store';
import {
  applyObservabilityContext,
  buildObservabilityContext,
  captureOperationalEvent,
} from '@/lib/observability';

export default function ObservabilityBridge() {
  const location = useLocation();
  const { user } = useAuth();
  const store = useStore();

  useEffect(() => {
    const context = buildObservabilityContext({
      user,
      store,
      route: location.pathname,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    });
    applyObservabilityContext(context);
    captureOperationalEvent('route_context_ready', {
      route: location.pathname,
      restaurant_id: store.restaurantId || 'none',
      branch_id: context.tags.branch_id,
      role: context.tags.role,
      online: context.tags.online,
    });
  }, [location.pathname, store.branchId, store.restaurantId, store.turnoActivo?.id, store.userRole, user?.id]);

  return null;
}
