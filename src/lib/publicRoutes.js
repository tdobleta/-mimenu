export const PUBLIC_RESERVATION_PATH = '/reservar';
export const PUBLIC_KITCHEN_PATH = '/monitor-cocina';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function buildPublicReservationUrl(origin, branchSlug) {
  const base = trimTrailingSlash(origin);
  const slug = encodeURIComponent(branchSlug || 'sin-id');
  return `${base}${PUBLIC_RESERVATION_PATH}/${slug}`;
}

export function buildPublicKitchenUrl(origin, branchId, token) {
  const base = trimTrailingSlash(origin);
  const params = new URLSearchParams();
  if (branchId) params.set('branch', branchId);
  if (token) params.set('token', token);
  const query = params.toString();
  return `${base}${PUBLIC_KITCHEN_PATH}${query ? `?${query}` : ''}`;
}
