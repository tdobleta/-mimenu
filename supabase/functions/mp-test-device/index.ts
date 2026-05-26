// Deprecated: usar mp-settings con action=test.

import { corsResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  return jsonResponse(req, {
    error: 'Funcion deprecada. Usar mp-settings con action=test.',
  }, 410);
});
