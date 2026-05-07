// ─── mimenú AFIP Service ──────────────────────────────────────────────────────
// Usa TusFacturasAPP como intermediario con AFIP/ARCA.
// Documentación: https://developers.tusfacturas.app/
//
// Flujo:
//  1. Restaurante crea cuenta en tusfacturas.app (1 mes gratis)
//  2. Configura credenciales en mimenú → Configuración → Facturación
//  3. Al cerrar mesa, el sistema emite la factura automáticamente
//  4. AFIP devuelve el CAE → se imprime en el ticket

const API_URL = 'https://www.tusfacturas.app/app/api/v2';
const STORAGE_KEY = 'mimenu_afip_config';

// ── Tipos de comprobante ──────────────────────────────────────────────────────
export const TIPO_COMPROBANTE = {
  FACTURA_A: 'FACTURA A',
  FACTURA_B: 'FACTURA B',
  FACTURA_C: 'FACTURA C',
};

// ── Condiciones IVA del restaurante ──────────────────────────────────────────
export const CONDICION_IVA_EMISOR = {
  RI:   'Responsable Inscripto',
  MONO: 'Monotributista',
  EX:   'Exento',
};

// ── Configuración default ─────────────────────────────────────────────────────
export const DEFAULT_AFIP_CONFIG = {
  habilitado:    false,
  usertoken:     '',
  tokenclient:   '',
  apitoken:      '',
  punto_venta:   '00001',
  cuit:          '',
  condicion_iva: 'RI',      // RI | MONO | EX
  alicuota_iva:  21,        // 21 | 10.5 | 0
  razon_social:  '',
  domicilio:     '',
  // Comportamiento
  auto_factura:  false,     // preguntar siempre en lugar de automático
};

// ── Leer / guardar config ─────────────────────────────────────────────────────
export function getAfipConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_AFIP_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_AFIP_CONFIG };
  } catch {
    return { ...DEFAULT_AFIP_CONFIG };
  }
}

export function saveAfipConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ── Formatear fecha para AFIP (dd/mm/yyyy) ───────────────────────────────────
function fmtFechaAfip(date = new Date()) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// ── Calcular precio sin IVA ───────────────────────────────────────────────────
function precioSinIva(totalConIva, alicuota) {
  if (alicuota === 0) return totalConIva;
  return Math.round((totalConIva / (1 + alicuota / 100)) * 100) / 100;
}

// ── Construir el detalle de ítems para AFIP ───────────────────────────────────
function buildDetalle(items, alicuota) {
  // Agrupar todos los ítems en una sola línea "Consumición" para simplificar
  // O enviar ítem por ítem (más detallado)
  return items.map((item, idx) => ({
    cantidad: item.qty,
    producto: {
      descripcion:            item.nombre,
      unidad_bulto:           1,
      lista_precios:          'Lista general',
      codigo:                 String(idx + 1).padStart(4, '0'),
      precio_unitario_sin_iva: precioSinIva(item.precio, alicuota),
      alicuota:               alicuota,
      unidad_medida:          '7', // unidades
    },
    leyenda: item.nota || '',
  }));
}

// ── Emitir Factura B (Consumidor Final) ───────────────────────────────────────
export async function emitirFacturaB({ items, total, descuento = 0, mesa, fecha }) {
  const cfg = getAfipConfig();
  if (!cfg.habilitado || !cfg.usertoken || !cfg.tokenclient || !cfg.apitoken) {
    throw new Error('Facturación no configurada. Completá los datos en Configuración → Facturación.');
  }

  const fechaStr = fmtFechaAfip();
  const totalNeto = total - descuento;
  const detalle = buildDetalle(items, cfg.alicuota_iva);

  const body = {
    usertoken:   cfg.usertoken,
    tokenclient: cfg.tokenclient,
    apitoken:    cfg.apitoken,
    cliente: {
      documento_tipo:    'OTRO',
      documento_nro:     '0',
      nombre:            'Consumidor Final',
      email:             '',
      domicilio:         '',
      provincia:         '1',
      envia_por_mail:    'N',
      condicion_pago:    '211',
      condicion_pago_otra: '',
      condicion_iva:     'CF',
    },
    comprobante: {
      fecha:                    fechaStr,
      tipo:                     TIPO_COMPROBANTE.FACTURA_B,
      area_negocio:             'Gastronomía',
      concepto:                 'P',
      periodo_facturado_desde:  fechaStr,
      periodo_facturado_hasta:  fechaStr,
      rubro:                    'Gastronomía',
      rubro_grupo_contable:     'Ventas',
      detalle,
      bonificacion:             0,
      leyenda_gral:             mesa ? `Mesa ${mesa}` : '',
      nogravado:                0,
      flete:                    0,
      descuento:                descuento,
      punto_venta:              cfg.punto_venta,
      tributos:                 [],
      total:                    totalNeto,
    },
  };

  const res = await fetch(`${API_URL}/facturas/nuevo`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al conectar con TusFacturasAPP`);
  }

  const data = await res.json();

  if (data.error !== 'N') {
    const msg = Array.isArray(data.errores)
      ? data.errores.join('. ')
      : (data.error_msg || 'Error desconocido de AFIP');
    throw new Error(msg);
  }

  return {
    cae:            data.cae,
    cae_vto:        data.cae_vencimiento,
    numero:         data.comprobante_numero,
    tipo:           TIPO_COMPROBANTE.FACTURA_B,
    pdf_link:       data.comprobante_pdf_url || null,
    pdf_base64:     data.comprobante_pdf    || null,
    qr:             data.qr                 || null,
    fecha:          fechaStr,
    total:          totalNeto,
  };
}

// ── Emitir Factura A (Empresa con CUIT) ───────────────────────────────────────
export async function emitirFacturaA({ items, total, descuento = 0, mesa, cliente }) {
  const cfg = getAfipConfig();
  if (!cfg.habilitado || !cfg.usertoken || !cfg.tokenclient || !cfg.apitoken) {
    throw new Error('Facturación no configurada. Completá los datos en Configuración → Facturación.');
  }

  if (!cliente?.cuit || !cliente?.razon_social) {
    throw new Error('Para Factura A necesitás ingresar el CUIT y razón social del cliente.');
  }

  const fechaStr = fmtFechaAfip();
  const totalNeto = total - descuento;
  const detalle = buildDetalle(items, cfg.alicuota_iva);

  const body = {
    usertoken:   cfg.usertoken,
    tokenclient: cfg.tokenclient,
    apitoken:    cfg.apitoken,
    cliente: {
      documento_tipo:    'CUIT',
      documento_nro:     cliente.cuit.replace(/[-]/g, ''),
      nombre:            cliente.razon_social,
      email:             cliente.email || '',
      domicilio:         cliente.domicilio || '',
      provincia:         '1',
      envia_por_mail:    cliente.email ? 'S' : 'N',
      condicion_pago:    '211',
      condicion_pago_otra: '',
      condicion_iva:     'RI',
    },
    comprobante: {
      fecha:                    fechaStr,
      tipo:                     TIPO_COMPROBANTE.FACTURA_A,
      area_negocio:             'Gastronomía',
      concepto:                 'P',
      periodo_facturado_desde:  fechaStr,
      periodo_facturado_hasta:  fechaStr,
      rubro:                    'Gastronomía',
      rubro_grupo_contable:     'Ventas',
      detalle,
      bonificacion:             0,
      leyenda_gral:             mesa ? `Mesa ${mesa}` : '',
      nogravado:                0,
      flete:                    0,
      descuento:                descuento,
      punto_venta:              cfg.punto_venta,
      tributos:                 [],
      total:                    totalNeto,
    },
  };

  const res = await fetch(`${API_URL}/facturas/nuevo`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

  const data = await res.json();

  if (data.error !== 'N') {
    const msg = Array.isArray(data.errores) ? data.errores.join('. ') : (data.error_msg || 'Error AFIP');
    throw new Error(msg);
  }

  return {
    cae:        data.cae,
    cae_vto:    data.cae_vencimiento,
    numero:     data.comprobante_numero,
    tipo:       TIPO_COMPROBANTE.FACTURA_A,
    pdf_link:   data.comprobante_pdf_url || null,
    pdf_base64: data.comprobante_pdf    || null,
    qr:         data.qr                 || null,
    fecha:      fechaStr,
    total:      totalNeto,
    cliente,
  };
}

// ── Test de conexión ──────────────────────────────────────────────────────────
export async function testAfipConexion(cfg) {
  const res = await fetch(`${API_URL}/estado_servicios/alertas`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usertoken:   cfg.usertoken,
      tokenclient: cfg.tokenclient,
      apitoken:    cfg.apitoken,
    }),
  });
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  const data = await res.json();
  if (data.error !== 'N') throw new Error(data.error_msg || 'Credenciales inválidas');
  return data;
}

// ── Abrir PDF en nueva pestaña ────────────────────────────────────────────────
export function abrirPdfFactura(result) {
  if (result.pdf_link) {
    window.open(result.pdf_link, '_blank');
  } else if (result.pdf_base64) {
    const byteChars = atob(result.pdf_base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  }
}
