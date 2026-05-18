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

  // teamMembers ya cargó y el usuario no pertenece a este restaurante
  if (Array.isArray(teamMembers)) return null;

  return null;
}


