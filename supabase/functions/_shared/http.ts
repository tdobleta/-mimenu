const DEFAULT_ALLOWED_ORIGINS = [
  'https://mimenuar.netlify.app',
  'https://app.mimenu.ar',
  'https://www.mimenu.app',
];

const DEFAULT_ORIGIN = DEFAULT_ALLOWED_ORIGINS[0];

function configuredOrigins() {
  const raw = Deno.env.get('APP_ALLOWED_ORIGINS') || '';
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins()];
  const allowed = origin && (allowedOrigins.includes(origin) || isLocalDevOrigin(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : DEFAULT_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function corsResponse(req: Request) {
  return new Response('ok', { headers: getCorsHeaders(req) });
}

export function jsonResponse(req: Request, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), ...headers, 'Content-Type': 'application/json' },
  });
}
