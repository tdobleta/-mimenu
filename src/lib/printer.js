// ─── mimenú PrintService ──────────────────────────────────────────────────────
// Soporta:
//   1. Epson ePOS SDK  → impresoras Epson de red, sin diálogo, instantáneo
//   2. Browser print   → cualquier impresora con driver (USB, red, cualquier marca)
//
// Configuración guardada en localStorage bajo 'mimenu_printer_config'

const STORAGE_KEY = 'mimenu_printer_config';

// ── Configuración por defecto ─────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  method: 'browser',        // 'epson' | 'browser'
  epsonIp: '',              // ej: '192.168.1.100'
  epsonPort: 8008,          // 8008 (HTTP) o 8043 (HTTPS)
  paperWidth: 80,           // 58 o 80 mm
  // Datos del local (para el encabezado del ticket)
  nombreLocal: '',
  direccion: '',
  cuit: '',
  telefono: '',
  mensajePie: 'Gracias por su visita',
  // Comportamiento
  autoPrintRecibo: true,    // imprimir automático al cerrar mesa
  autoPrintComanda: true,   // imprimir automático al enviar a cocina
  copiasComanda: 1,         // cuántas copias de la comanda
};

// ── Leer / guardar config ─────────────────────────────────────────────────────
export function getPrinterConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function savePrinterConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ── Estado de conexión Epson (singleton) ──────────────────────────────────────
let epsonDevice = null;
let epsonPrinter = null;
let epsonStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
const listeners = new Set();

function notify() { listeners.forEach(fn => fn(epsonStatus)); }
export function onEpsonStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getEpsonStatus() { return epsonStatus; }

// ── Conectar a impresora Epson por red ────────────────────────────────────────
export function connectEpson(ip, port = 8008) {
  return new Promise((resolve, reject) => {
    if (!window.epson?.ePOSDevice) {
      reject(new Error('SDK Epson no cargado. Verificá que epos-2.27.0.js está en /public/'));
      return;
    }
    epsonStatus = 'connecting'; notify();
    epsonDevice = new window.epson.ePOSDevice();
    epsonDevice.connect(ip, port, (result) => {
      if (result !== 'OK' && result !== 'SSL_CONNECT_OK') {
        epsonStatus = 'error'; notify();
        reject(new Error(`No se pudo conectar a ${ip}:${port} — ${result}`));
        return;
      }
      epsonDevice.createDevice('local_printer', epsonDevice.DEVICE_TYPE_PRINTER,
        { crypto: false, buffer: false },
        (devobj, retcode) => {
          if (retcode !== 'OK') {
            epsonStatus = 'error'; notify();
            reject(new Error(`Error al crear dispositivo: ${retcode}`));
            return;
          }
          epsonPrinter = devobj;
          epsonStatus = 'connected'; notify();
          resolve();
        }
      );
    });
  });
}

export function disconnectEpson() {
  if (epsonDevice) { try { epsonDevice.disconnect(); } catch {} }
  epsonDevice = null; epsonPrinter = null;
  epsonStatus = 'disconnected'; notify();
}

// ── Formatear línea para 80mm (42 chars) o 58mm (32 chars) ───────────────────
function lineWidth(paperWidth) { return paperWidth === 58 ? 32 : 42; }

function padLine(left, right, width) {
  const space = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right;
}

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function separator(char = '-', width = 42) { return char.repeat(width); }

function formatMoney(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

// ── Generar texto del ticket ──────────────────────────────────────────────────
export function buildReceiptText({ config, mesa, mozo, items, subtotal, descuento, propina, total, metodo, fecha }) {
  const W = lineWidth(config.paperWidth);
  const lines = [];

  // Encabezado
  if (config.nombreLocal) lines.push(centerText(config.nombreLocal.toUpperCase(), W));
  if (config.direccion)   lines.push(centerText(config.direccion, W));
  if (config.cuit)        lines.push(centerText(`CUIT: ${config.cuit}`, W));
  if (config.telefono)    lines.push(centerText(`Tel: ${config.telefono}`, W));
  lines.push(separator('=', W));

  // Info de mesa
  lines.push(padLine(`Mesa ${mesa}`, fecha, W));
  if (mozo) lines.push(`Mozo: ${mozo}`);
  lines.push(separator('-', W));

  // Items
  items.forEach(it => {
    const nombre = it.nombre.length > W - 12 ? it.nombre.substring(0, W - 15) + '...' : it.nombre;
    lines.push(padLine(`${it.qty}x ${nombre}`, formatMoney(it.precio * it.qty), W));
    if (it.nota) lines.push(`   * ${it.nota}`);
  });
  lines.push(separator('-', W));

  // Totales
  if (descuento > 0) {
    lines.push(padLine('Subtotal', formatMoney(subtotal), W));
    lines.push(padLine('Descuento', `-${formatMoney(descuento)}`, W));
  }
  if (propina > 0) lines.push(padLine('Propina', formatMoney(propina), W));

  lines.push(separator('=', W));
  lines.push(padLine('TOTAL', formatMoney(total), W));
  lines.push(separator('=', W));
  lines.push(`Forma de pago: ${metodo}`);
  lines.push('');
  lines.push(centerText('No es comprobante fiscal', W));
  if (config.mensajePie) lines.push(centerText(config.mensajePie, W));
  lines.push('');

  return lines.join('\n');
}

// ── Generar texto de comanda de cocina ────────────────────────────────────────
export function buildComandaText({ config, mesa, mozo, items, fecha, copia = 1, total = 1 }) {
  const W = lineWidth(config.paperWidth);
  const lines = [];

  lines.push(centerText('*** COMANDA ***', W));
  lines.push(separator('=', W));
  lines.push(padLine(`MESA ${mesa}`, fecha, W));
  if (mozo) lines.push(`Mozo: ${mozo}`);
  if (total > 1) lines.push(centerText(`[Copia ${copia} de ${total}]`, W));
  lines.push(separator('=', W));

  items.forEach(it => {
    lines.push(`${it.qty}x  ${it.nombre}`);
    if (it.nota) lines.push(`   >> ${it.nota}`);
    if (it.modificadores?.length) {
      it.modificadores.forEach(m => lines.push(`   + ${m}`));
    }
  });

  lines.push(separator('-', W));
  lines.push(centerText(`${new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}`, W));
  lines.push('');

  return lines.join('\n');
}

// ── Imprimir con Epson ePOS ───────────────────────────────────────────────────
function printEpson(text, { cut = true, bold = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!epsonPrinter) { reject(new Error('Impresora Epson no conectada')); return; }
    const prn = epsonPrinter;
    prn.addTextLang('es');
    prn.addTextSmooth(true);
    if (bold) prn.addTextStyle(false, false, true, prn.COLOR_1);
    prn.addText(text);
    if (cut) { prn.addFeedLine(4); prn.addCut(prn.CUT_FEED); }
    prn.send();
    prn.onreceive = ({ success }) => {
      if (success) resolve();
      else reject(new Error('Error al imprimir'));
    };
    prn.onerror = (err) => reject(new Error(`Error Epson: ${err.status}`));
  });
}

// ── Imprimir con browser (window.print) ───────────────────────────────────────
function printBrowser(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        resolve();
      }, 500);
    }, 300);
  });
}

// ── HTML para browser print ───────────────────────────────────────────────────
function buildReceiptHtml({ config, mesa, mozo, items, subtotal, descuento, propina, total, metodo, fecha }) {
  const rows = items.map(it => `
    <tr>
      <td class="qty">${it.qty}x</td>
      <td class="nombre">${it.nombre}${it.nota ? `<br><small class="nota">→ ${it.nota}</small>` : ''}</td>
      <td class="precio">${formatMoney(it.precio * it.qty)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { margin: 4mm; size: ${config.paperWidth}mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 11px; width: ${config.paperWidth - 8}mm; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .nombre-local { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 2px; }
    .sep { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    .sep-solid { border: none; border-top: 2px solid #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    .qty { width: 24px; vertical-align: top; }
    .nombre { vertical-align: top; padding: 0 4px; }
    .precio { text-align: right; white-space: nowrap; vertical-align: top; }
    .nota { color: #555; font-size: 10px; }
    .totales td { padding: 1px 0; }
    .totales .label { }
    .totales .val { text-align: right; }
    .total-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 3px; }
    .pie { text-align: center; font-size: 10px; margin-top: 6px; color: #555; }
    .metodo { margin-top: 4px; font-size: 11px; }
  </style>
  </head><body>
    ${config.nombreLocal ? `<div class="nombre-local">${config.nombreLocal}</div>` : ''}
    ${config.direccion   ? `<div class="center">${config.direccion}</div>` : ''}
    ${config.cuit        ? `<div class="center">CUIT: ${config.cuit}</div>` : ''}
    ${config.telefono    ? `<div class="center">Tel: ${config.telefono}</div>` : ''}
    <hr class="sep-solid">
    <table><tr>
      <td class="bold">Mesa ${mesa}</td>
      <td style="text-align:right">${fecha}</td>
    </tr></table>
    ${mozo ? `<div>Mozo: ${mozo}</div>` : ''}
    <hr class="sep">
    <table>${rows}</table>
    <hr class="sep-solid">
    <table class="totales">
      ${descuento > 0 ? `<tr><td class="label">Subtotal</td><td class="val">${formatMoney(subtotal)}</td></tr>` : ''}
      ${descuento > 0 ? `<tr><td class="label">Descuento</td><td class="val">-${formatMoney(descuento)}</td></tr>` : ''}
      ${propina   > 0 ? `<tr><td class="label">Propina</td><td class="val">${formatMoney(propina)}</td></tr>` : ''}
      <tr class="total-row"><td class="label">TOTAL</td><td class="val">${formatMoney(total)}</td></tr>
    </table>
    <div class="metodo">Forma de pago: ${metodo}</div>
    <hr class="sep">
    <div class="pie">No es comprobante fiscal</div>
    ${config.mensajePie ? `<div class="pie">${config.mensajePie}</div>` : ''}
  </body></html>`;
}

function buildComandaHtml({ config, mesa, mozo, items, fecha, copia = 1, total = 1 }) {
  const rows = items.map(it => `
    <tr>
      <td class="qty bold">${it.qty}x</td>
      <td class="nombre">
        <strong>${it.nombre}</strong>
        ${it.nota ? `<br><span class="nota">→ ${it.nota}</span>` : ''}
        ${it.modificadores?.map(m => `<br><span class="mod">+ ${m}</span>`).join('') || ''}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { margin: 4mm; size: ${config.paperWidth}mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 13px; width: ${config.paperWidth - 8}mm; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .titulo { font-size: 18px; font-weight: bold; text-align: center; }
    .mesa { font-size: 22px; font-weight: bold; text-align: center; margin: 4px 0; }
    .sep { border: none; border-top: 2px solid #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    .qty { width: 28px; vertical-align: top; font-size: 15px; }
    .nombre { vertical-align: top; padding-left: 4px; font-size: 14px; }
    .nota { font-size: 12px; }
    .mod { font-size: 12px; }
    .hora { text-align: center; font-size: 11px; margin-top: 6px; }
    .copia { text-align: center; font-size: 11px; border: 1px solid #000; padding: 2px; margin: 3px 0; }
  </style>
  </head><body>
    <div class="titulo">*** COMANDA ***</div>
    <hr class="sep">
    <div class="mesa">MESA ${mesa}</div>
    <table><tr><td>${mozo ? `Mozo: ${mozo}` : ''}</td><td style="text-align:right">${fecha}</td></tr></table>
    ${total > 1 ? `<div class="copia">Copia ${copia} de ${total}</div>` : ''}
    <hr class="sep">
    <table>${rows}</table>
    <hr class="sep">
    <div class="hora">${new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}</div>
  </body></html>`;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Imprime ticket de cliente.
 * @param {object} data - { mesa, mozo, items, subtotal, descuento, propina, total, metodo, fecha }
 * @param {object} configOverride - opcional, si no se pasa usa localStorage
 */
export async function printReceipt(data, configOverride = null) {
  const config = configOverride || getPrinterConfig();
  if (!config.method) {
    throw new Error('Impresora no configurada. Andá a Configuración → Impresora y elegí un método.');
  }
  const fecha = data.fecha || new Date().toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  const payload = { config, fecha, ...data };

  if (config.method === 'epson' && epsonPrinter) {
    const text = buildReceiptText(payload);
    await printEpson(text);
  } else {
    const html = buildReceiptHtml(payload);
    await printBrowser(html);
  }
}

/**
 * Imprime comanda de cocina.
 * @param {object} data - { mesa, mozo, items, fecha }
 * @param {object} configOverride - opcional
 */
export async function printComanda(data, configOverride = null) {
  const config = configOverride || getPrinterConfig();
  if (!config.method) {
    throw new Error('Impresora no configurada. Andá a Configuración → Impresora y elegí un método.');
  }
  const fecha = data.fecha || new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const copias = config.copiasComanda || 1;

  for (let i = 1; i <= copias; i++) {
    const payload = { config, fecha, copia: i, total: copias, ...data };
    if (config.method === 'epson' && epsonPrinter) {
      await printEpson(buildComandaText(payload));
    } else {
      await printBrowser(buildComandaHtml(payload));
    }
    if (i < copias) await new Promise(r => setTimeout(r, 400));
  }
}
