// Edge Function: facturar
// Emite comprobantes AFIP/ARCA via TusFacturasAPP sin exponer credenciales al browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TUSFACTURAS_API = 'https://www.tusfacturas.app/app/api/v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FacturaTipo = 'A' | 'B';

type AfipConfig = {
  habilitado?: boolean;
  usertoken?: string;
  tokenclient?: string;
  apitoken?: string;
  punto_venta?: string;
  alicuota_iva?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayAfip() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseCaeDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = String(value).trim();
  const slash = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function precioSinIva(totalConIva: number, alicuota: number) {
  if (!alicuota) return totalConIva;
  return Math.round((totalConIva / (1 + alicuota / 100)) * 100) / 100;
}

function buildDetalle(items: any[], alicuota: number) {
  return (items || []).map((item, idx) => ({
    cantidad: Number(item.qty || item.cantidad || 1),
    producto: {
      descripcion: item.nombre || item.name || 'Consumicion',
      unidad_bulto: 1,
      lista_precios: 'Lista general',
      codigo: String(idx + 1).padStart(4, '0'),
      precio_unitario_sin_iva: precioSinIva(Number(item.precio || item.price || 0), alicuota),
      alicuota,
      unidad_medida: '7',
    },
    leyenda: item.nota || item.notas || '',
  }));
}

async function getUserRestaurant(supabase: any, user: any, restaurantId?: string) {
  if (restaurantId) {
    const { data: owned } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', restaurantId)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (owned) return owned;

    const { data: team } = await supabase
      .from('team_members')
      .select('restaurant_id')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!team) return null;

    const { data: rest } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', restaurantId)
      .maybeSingle();
    return rest;
  }

  const { data: owned } = await supabase
    .from('restaurants')
    .select('id, nombre')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (owned) return owned;

  const { data: team } = await supabase
    .from('team_members')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (team?.restaurant_id) {
    const { data: rest } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', team.restaurant_id)
      .maybeSingle();
    return rest;
  }
  return null;
}

function settingsToConfig(settings: any): AfipConfig {
  const jsonCfg = settings?.afip_config || {};
  return {
    ...jsonCfg,
    usertoken: settings?.tusfacturas_usertoken || jsonCfg.usertoken || '',
    tokenclient: settings?.tusfacturas_tokenclient || jsonCfg.tokenclient || '',
    apitoken: settings?.tusfacturas_apitoken || jsonCfg.apitoken || '',
    punto_venta: settings?.tusfacturas_punto_venta || jsonCfg.punto_venta || '00001',
    alicuota_iva: Number(jsonCfg.alicuota_iva || 21),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Sesion invalida' }, 401);

    const body = await req.json();
    const tipo = String(body.tipo || 'B').toUpperCase() as FacturaTipo;
    const restaurantId = body.restaurantId || body.restaurant_id;
    const branchId = body.branchId || body.branch_id || null;
    const turnId = body.turnId || body.turn_id || null;
    const items = Array.isArray(body.items) ? body.items : [];
    const total = Number(body.total || 0);
    const descuento = Number(body.descuento || 0);
    const mesa = body.mesa;
    const cliente = body.cliente || null;

    if (!['A', 'B'].includes(tipo)) return json({ error: 'Tipo de factura invalido' }, 400);
    if (!items.length || total <= 0) return json({ error: 'Factura sin items o total invalido' }, 400);
    if (tipo === 'A' && (!cliente?.cuit || !cliente?.razon_social)) {
      return json({ error: 'Factura A requiere CUIT y razon social' }, 400);
    }

    const restaurant = await getUserRestaurant(supabase, user, restaurantId);
    if (!restaurant?.id) return json({ error: 'Sin acceso a este restaurante' }, 403);

    if (branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branchId)
        .eq('restaurant_id', restaurant.id)
        .maybeSingle();
      if (!branch) return json({ error: 'Sucursal invalida' }, 403);
    }

    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('afip_config, tusfacturas_usertoken, tusfacturas_tokenclient, tusfacturas_apitoken, tusfacturas_punto_venta')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle();

    const cfg = settingsToConfig(settings);
    if (!cfg.habilitado || !cfg.usertoken || !cfg.tokenclient || !cfg.apitoken) {
      return json({ error: 'Facturacion no configurada. Ir a Configuracion -> Facturacion.' }, 422);
    }

    const fecha = todayAfip();
    const totalNeto = total - descuento;
    const detalle = buildDetalle(items, Number(cfg.alicuota_iva || 21));

    const tusFacturasBody = {
      usertoken: cfg.usertoken,
      tokenclient: cfg.tokenclient,
      apitoken: cfg.apitoken,
      cliente: tipo === 'A'
        ? {
          documento_tipo: 'CUIT',
          documento_nro: String(cliente.cuit).replace(/[-\s]/g, ''),
          nombre: cliente.razon_social,
          email: cliente.email || '',
          domicilio: cliente.domicilio || '',
          provincia: '1',
          envia_por_mail: cliente.email ? 'S' : 'N',
          condicion_pago: '211',
          condicion_pago_otra: '',
          condicion_iva: 'RI',
        }
        : {
          documento_tipo: 'OTRO',
          documento_nro: '0',
          nombre: 'Consumidor Final',
          email: '',
          domicilio: '',
          provincia: '1',
          envia_por_mail: 'N',
          condicion_pago: '211',
          condicion_pago_otra: '',
          condicion_iva: 'CF',
        },
      comprobante: {
        fecha,
        tipo: tipo === 'A' ? 'FACTURA A' : 'FACTURA B',
        area_negocio: 'Gastronomia',
        concepto: 'P',
        periodo_facturado_desde: fecha,
        periodo_facturado_hasta: fecha,
        rubro: 'Gastronomia',
        rubro_grupo_contable: 'Ventas',
        detalle,
        bonificacion: 0,
        leyenda_gral: mesa ? `Mesa ${mesa}` : '',
        nogravado: 0,
        flete: 0,
        descuento,
        punto_venta: cfg.punto_venta || '00001',
        tributos: [],
        total: totalNeto,
      },
    };

    const tfRes = await fetch(`${TUSFACTURAS_API}/facturas/nuevo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tusFacturasBody),
    });

    const tfData = await tfRes.json().catch(() => ({}));
    if (!tfRes.ok || tfData.error !== 'N') {
      const msg = Array.isArray(tfData.errores)
        ? tfData.errores.join('. ')
        : (tfData.error_msg || tfData.message || `Error HTTP ${tfRes.status} al emitir factura`);
      return json({ error: msg }, tfRes.ok ? 422 : tfRes.status);
    }

    const result = {
      cae: tfData.cae,
      cae_vto: tfData.cae_vencimiento,
      numero: tfData.comprobante_numero,
      tipo: tipo === 'A' ? 'FACTURA A' : 'FACTURA B',
      pdf_link: tfData.comprobante_pdf_url || null,
      pdf_base64: tfData.comprobante_pdf || null,
      qr: tfData.qr || null,
      fecha,
      total: totalNeto,
      cliente: tipo === 'A' ? cliente : null,
    };

    const { data: facturaRow, error: facturaErr } = await supabase
      .from('facturas')
      .insert({
        restaurant_id: restaurant.id,
        branch_id: branchId,
        turn_id: turnId,
        tipo,
        numero: result.numero || null,
        punto_venta: cfg.punto_venta || null,
        cae: result.cae || null,
        vto_cae: parseCaeDate(result.cae_vto),
        total: result.total || 0,
        condicion_iva_receptor: tipo === 'B' ? 'Consumidor Final' : (cliente?.razon_social || 'Empresa'),
        pdf_url: result.pdf_link || null,
      })
      .select('id')
      .single();

    if (facturaErr) {
      console.warn('[facturar] No se pudo guardar historial:', facturaErr.message);
    }

    return json({ ok: true, ...result, factura_id: facturaRow?.id || null });
  } catch (err: any) {
    console.error('[facturar]', err);
    return json({ error: err?.message || 'Error interno' }, 500);
  }
});
