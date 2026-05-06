import { useAuth } from '@/lib/AuthContext';
import { useStore } from '@/lib/store';

export default function useUserRole() {
  const { user } = useAuth();
  const { teamMembers, ownerEmail, loading } = useStore();

  if (loading) return null;
  if (!user) return null;

  if (user?.role === 'admin') return 'Dueno';
  if (ownerEmail && user?.email === ownerEmail) return 'Dueno';

  const member = (teamMembers || []).find(m => m.email === user?.email);
  if (member && member.rol) return member.rol;

  // Si teamMembers ya cargó y no encontró nada, es un usuario sin rol asignado
  // No escalar privilegios — dar el mínimo acceso
  if (teamMembers && teamMembers.length >= 0) return 'Mozo';

  return 'Mozo';
}


