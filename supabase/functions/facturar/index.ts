// supabase/functions/facturar/index.ts
// Edge Function para emisión de facturas electrónicas via TusFacturasApp.
// Las credenciales fiscales NUNCA tocan el browser — viven en Supabase Vault.
// Rate limiting via Upstash Redis: 10 facturas/minuto por restaurante.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Rate limiting con Upstash Redis ──────────────────────────
async function checkRateLimit(restaurantId: string): Promise<{ allowed: boolean; remaining: number }> {
  const UPSTASH_URL   = Deno.env.get('UPSTASH_REDIS_REST_URL')!;
  const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!;

  const key = `ratelimit:facturar:${restaurantId}`;
  const limit = 10;    // máx 10 facturas por minuto por restaurante
  const window = 60;   // ventana de 60 segundos

  try {
    // INCR atómica + TTL
    const incrRes = await fetch(`${UPSTASH_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const { result: count } = await incrRes.json();

    // Setear TTL solo en el primer request de la ventana
    if (count === 1) {
      await fetch(`${UPSTASH_URL}/expire/${key}/${window}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
    }

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  } catch {
    // Si Redis falla, permitimos la operación (fail open)
    return { allowed: true, remaining: 10 };
  }
}

// ── Leer credenciales desde Supabase Vault ───────────────────
async function getAfipCredentials(supabase: any, branchId: string) {
  const { data, error } = await supabase
    .rpc('vault.decrypted_secrets')
    .eq('name', `afip_${branchId}`)
    .single();

  if (error || !data) throw new Error('Credenciales AFIP no configuradas para esta sucursal');
  return JSON.parse(data.decrypted_secret);
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // 1. Autenticar usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parsear body
    const { branchId, turnId, items, total, tipoFactura = 'B', condicionIva = 'CONSUMIDOR_FINAL' } = await req.json();
    if (!branchId || !turnId || !items?.length || !total) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Verificar que el usuario pertenece al restaurante de esta sucursal
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('restaurant_id')
      .eq('id', branchId)
      .single();

    if (branchError || !branch) {
      return new Response(JSON.stringify({ error: 'Sucursal no encontrada' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 4. Rate limiting por restaurante
    const { allowed, remaining } = await checkRateLimit(branch.restaurant_id);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Límite de facturas excedido. Reintentá en 1 minuto.' }), {
        status: 429,
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      });
    }

    // 5. Leer credenciales de TusFacturasApp desde Vault
    // Por ahora usamos variables de entorno hasta que el cliente configure Vault
    const apiToken    = Deno.env.get('TUSFACTURAS_API_TOKEN') || '';
    const apiKey      = Deno.env.get('TUSFACTURAS_API_KEY') || '';
    const userToken   = Deno.env.get('TUSFACTURAS_USER_TOKEN') || '';

    if (!apiToken || !apiKey || !userToken) {
      return new Response(JSON.stringify({
        error: 'Facturación AFIP no configurada. Configurá las credenciales en Configuración.',
        code: 'AFIP_NOT_CONFIGURED',
      }), {
        status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 6. Armar payload para TusFacturasApp
    const payload = {
      apitoken: apiToken,
      apikey: apiKey,
      usertoken: userToken,
      requests: {
        tipo_de_comprobante: tipoFactura,
        operacion: 'V',
        punto_de_venta: Deno.env.get('AFIP_PUNTO_VENTA') || '1',
        condicion_pago: 'CONTADO',
        condicion_pago_otra: '',
        periodo_facturado_desde: '',
        periodo_facturado_hasta: '',
        cliente: {
          condicion_iva: condicionIva,
          domicilio: '',
          razon_social: 'Consumidor Final',
          email: '',
          cuit: condicionIva === 'CONSUMIDOR_FINAL' ? '0' : '',
        },
        items: items.map((item: any) => ({
          unidades: item.cantidad || 1,
          codigo: item.id || '000',
          descripcion: item.nombre,
          lista_precios: '',
          leyenda: item.notas || '',
          precio_unitario_sin_iva: (item.precio / 1.21).toFixed(2),
          alicuota: 21,
          unidad_bulto: 1,
          numero_item: '',
        })),
        bonificacion: 0,
        leyenda_gral: '',
        fecha: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/'),
      },
    };

    // 7. Llamar a TusFacturasApp
    const facturaRes = await fetch('https://www.tusfacturas.app/app/api/v2/facturacion/nuevo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const facturaData = await facturaRes.json();

    if (!facturaRes.ok || facturaData.error !== 'N') {
      // Log del error en audit_logs
      await supabase.from('audit_logs').insert({
        restaurant_id: branch.restaurant_id,
        branch_id: branchId,
        usuario: user.email,
        rol: 'Sistema',
        categoria: 'Facturación',
        accion: 'Error AFIP',
        detalle: JSON.stringify(facturaData),
        ts: Date.now(),
      });

      return new Response(JSON.stringify({
        error: 'Error al facturar con AFIP',
        detalle: facturaData.errores || facturaData,
      }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 8. Guardar CAE en el turno
    const cae = facturaData.cae;
    await supabase.from('turns').update({
      cae,
      cae_vto: facturaData.vencimiento_cae,
      factura_numero: facturaData.comprobante_nro,
      factura_tipo: tipoFactura,
    }).eq('id', turnId);

    // 9. Log exitoso en audit_logs
    await supabase.from('audit_logs').insert({
      restaurant_id: branch.restaurant_id,
      branch_id: branchId,
      usuario: user.email,
      rol: 'Sistema',
      categoria: 'Facturación',
      accion: 'Factura emitida',
      detalle: `CAE: ${cae} | Comprobante: ${facturaData.comprobante_nro} | Total: $${total}`,
      ts: Date.now(),
    });

    return new Response(JSON.stringify({
      ok: true,
      cae,
      vencimiento_cae: facturaData.vencimiento_cae,
      comprobante_nro: facturaData.comprobante_nro,
      remaining_requests: remaining,
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(remaining),
      },
    });

  } catch (err) {
    console.error('[facturar]', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
