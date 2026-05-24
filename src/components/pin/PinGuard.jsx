// components/pin/PinGuard.jsx
// Envuelve rutas operativas (Salon, Delivery, POSView).
// Si no hay activeStaff válido → muestra PinSelector a pantalla completa.
// Si sí hay → renderiza los children normalmente.

import { useStore } from '@/lib/store';
import { useActiveStaff } from '@/lib/useActiveStaff';
import PinSelector from './PinSelector';

export default function PinGuard({ children }) {
  const store = useStore();
  const { activeStaff, setActiveStaff } = useActiveStaff();

  const branchId = store.branchId !== 'todas'
    ? store.branchId
    : store.sucursales[0]?.id;

  if (!activeStaff) {
    return (
      <PinSelector
        branchId={branchId}
        onSelect={setActiveStaff}
      />
    );
  }

  return children;
}
