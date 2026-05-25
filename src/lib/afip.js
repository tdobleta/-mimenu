import { supabase } from '@/api/supabaseClient';

// mimenu AFIP service.
// Emision fiscal: siempre via Edge Function `facturar`.
// El navegador no llama a TusFacturasAPP para emitir comprobantes.

const STORAGE_KEY = 'mimenu_afip_config';
const SECRET_KEYS = ['usertoken', 'tokenclient', 'apitoken'];

export const TIPO_COMPROBANTE = {
  FACTURA_A: 'FACTURA A',
  FACTURA_B: 'FACTURA B',
  FACTURA_C: 'FACTURA C',
};

export const CONDICION_IVA_EMISOR = {
  RI: 'Responsable Inscripto',
  MONO: 'Monotributista',
  EX: 'Exento',
};

export const DEFAULT_AFIP_CONFIG = {
  habilitado: false,
  usertoken: '',
  tokenclient: '',
  apitoken: '',
  punto_venta: '00001',
  cuit: '',
  condicion_iva: 'RI',
  alicuota_iva: 21,
  razon_social: '',
  domicilio: '',
  auto_factura: false,
};

function sanitizeConfig(cfg = {}) {
  const clean = { ...cfg };
  SECRET_KEYS.forEach(key => { clean[key] = ''; });
  return clean;
}

export function getAfipConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeConfig({ ...DEFAULT_AFIP_CONFIG, ...JSON.parse(raw) }) : { ...DEFAULT_AFIP_CONFIG };
  } catch {
    return { ...DEFAULT_AFIP_CONFIG };
  }
}

export function saveAfipConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeConfig(cfg)));
}

async function invokeAfipSettings(body) {
  const { data, error } = await supabase.functions.invoke('afip-settings', { body });
  if (error) throw new Error(error.message || 'No se pudo acceder a configuracion AFIP');
  if (data?.error) throw new Error(data.error);
  if (!data?.ok) throw new Error('Respuesta invalida de configuracion AFIP');
  return data;
}

export async function loadAfipSettings(restaurantId) {
  const data = await invokeAfipSettings({ action: 'load', restaurantId });
  const cfg = sanitizeConfig({ ...DEFAULT_AFIP_CONFIG, ...(data.config || {}) });
  saveAfipConfig(cfg);
  return {
    ...data,
    config: cfg,
    credentials: data.credentials || { usertoken: false, tokenclient: false, apitoken: false },
  };
}

export async function saveAfipSettings(cfg, restaurantId) {
  const data = await invokeAfipSettings({ action: 'save', restaurantId, config: cfg });
  const clean = sanitizeConfig({ ...DEFAULT_AFIP_CONFIG, ...(data.config || cfg) });
  saveAfipConfig(clean);
  return {
    ...data,
    config: clean,
    credentials: data.credentials || { usertoken: false, tokenclient: false, apitoken: false },
  };
}

async function invokeFacturar(body) {
  const { data, error } = await supabase.functions.invoke('facturar', { body });
  if (error) throw new Error(error.message || 'No se pudo emitir factura');
  if (data?.error) throw new Error(data.error);
  if (!data?.ok) throw new Error('Respuesta invalida de facturacion');
  return data;
}

export async function emitirFacturaB({
  items,
  total,
  descuento = 0,
  mesa,
  restaurantId,
  branchId,
  turnId,
}) {
  const cfg = getAfipConfig();
  if (!cfg.habilitado) {
    throw new Error('Facturacion no configurada. Completa los datos en Configuracion -> Facturacion.');
  }

  return invokeFacturar({
    tipo: 'B',
    items,
    total,
    descuento,
    mesa,
    restaurantId,
    branchId,
    turnId,
  });
}

export async function emitirFacturaA({
  items,
  total,
  descuento = 0,
  mesa,
  cliente,
  restaurantId,
  branchId,
  turnId,
}) {
  const cfg = getAfipConfig();
  if (!cfg.habilitado) {
    throw new Error('Facturacion no configurada. Completa los datos en Configuracion -> Facturacion.');
  }
  if (!cliente?.cuit || !cliente?.razon_social) {
    throw new Error('Para Factura A necesitas ingresar el CUIT y razon social del cliente.');
  }

  return invokeFacturar({
    tipo: 'A',
    items,
    total,
    descuento,
    mesa,
    cliente,
    restaurantId,
    branchId,
    turnId,
  });
}

export async function testAfipConexion(cfg, restaurantId) {
  return invokeAfipSettings({ action: 'test', restaurantId, config: cfg });
}

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
