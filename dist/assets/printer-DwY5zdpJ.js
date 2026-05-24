const E="mimenu_printer_config",v={method:"browser",epsonIp:"",epsonPort:8008,paperWidth:80,nombreLocal:"",direccion:"",cuit:"",telefono:"",mensajePie:"Gracias por su visita",autoPrintRecibo:!0,autoPrintComanda:!0,copiasComanda:1};function C(){try{const e=localStorage.getItem(E);return e?{...v,...JSON.parse(e)}:{...v}}catch{return{...v}}}function M(e){localStorage.setItem(E,JSON.stringify(e))}let g=null,x=null,$="disconnected";const y=new Set;function w(){y.forEach(e=>e($))}function I(e){return y.add(e),()=>y.delete(e)}function N(){return $}function R(e,r=8008){return new Promise((t,d)=>{var i;if(!((i=window.epson)!=null&&i.ePOSDevice)){d(new Error("SDK Epson no cargado. Verificá que epos-2.27.0.js está en /public/"));return}$="connecting",w(),g=new window.epson.ePOSDevice,g.connect(e,r,o=>{if(o!=="OK"&&o!=="SSL_CONNECT_OK"){$="error",w(),d(new Error(`No se pudo conectar a ${e}:${r} — ${o}`));return}g.createDevice("local_printer",g.DEVICE_TYPE_PRINTER,{crypto:!1,buffer:!1},(l,p)=>{if(p!=="OK"){$="error",w(),d(new Error(`Error al crear dispositivo: ${p}`));return}x=l,$="connected",w(),t()})})})}function W(){if(g)try{g.disconnect()}catch{}g=null,x=null,$="disconnected",w()}function T(e){return e===58?32:42}function b(e,r,t){const d=t-e.length-r.length;return e+" ".repeat(Math.max(1,d))+r}function m(e,r){const t=Math.max(0,Math.floor((r-e.length)/2));return" ".repeat(t)+e}function f(e="-",r=42){return e.repeat(r)}function u(e){return"$"+Math.round(e).toLocaleString("es-AR")}function z({config:e,mesa:r,mozo:t,items:d,subtotal:i,descuento:o,propina:l,total:p,metodo:s,fecha:c}){const a=T(e.paperWidth),n=[];return e.nombreLocal&&n.push(m(e.nombreLocal.toUpperCase(),a)),e.direccion&&n.push(m(e.direccion,a)),e.cuit&&n.push(m(`CUIT: ${e.cuit}`,a)),e.telefono&&n.push(m(`Tel: ${e.telefono}`,a)),n.push(f("=",a)),n.push(b(`Mesa ${r}`,c,a)),t&&n.push(`Mozo: ${t}`),n.push(f("-",a)),d.forEach(h=>{const D=h.nombre.length>a-12?h.nombre.substring(0,a-15)+"...":h.nombre;n.push(b(`${h.qty}x ${D}`,u(h.precio*h.qty),a)),h.nota&&n.push(`   * ${h.nota}`)}),n.push(f("-",a)),o>0&&(n.push(b("Subtotal",u(i),a)),n.push(b("Descuento",`-${u(o)}`,a))),l>0&&n.push(b("Propina",u(l),a)),n.push(f("=",a)),n.push(b("TOTAL",u(p),a)),n.push(f("=",a)),n.push(`Forma de pago: ${s}`),n.push(""),n.push(m("No es comprobante fiscal",a)),e.mensajePie&&n.push(m(e.mensajePie,a)),n.push(""),n.join(`
`)}function L({config:e,mesa:r,mozo:t,items:d,fecha:i,copia:o=1,total:l=1}){const p=T(e.paperWidth),s=[];return s.push(m("*** COMANDA ***",p)),s.push(f("=",p)),s.push(b(`MESA ${r}`,i,p)),t&&s.push(`Mozo: ${t}`),l>1&&s.push(m(`[Copia ${o} de ${l}]`,p)),s.push(f("=",p)),d.forEach(c=>{var a;s.push(`${c.qty}x  ${c.nombre}`),c.nota&&s.push(`   >> ${c.nota}`),(a=c.modificadores)!=null&&a.length&&c.modificadores.forEach(n=>s.push(`   + ${n}`))}),s.push(f("-",p)),s.push(m(`${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`,p)),s.push(""),s.join(`
`)}function S(e,{cut:r=!0,bold:t=!1}={}){return new Promise((d,i)=>{if(!x){i(new Error("Impresora Epson no conectada"));return}const o=x;o.addTextLang("es"),o.addTextSmooth(!0),t&&o.addTextStyle(!1,!1,!0,o.COLOR_1),o.addText(e),r&&(o.addFeedLine(4),o.addCut(o.CUT_FEED)),o.send(),o.onreceive=({success:l})=>{l?d():i(new Error("Error al imprimir"))},o.onerror=l=>i(new Error(`Error Epson: ${l.status}`))})}function P(e){return new Promise(r=>{const t=document.createElement("iframe");t.style.cssText="position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;",document.body.appendChild(t),t.contentDocument.open(),t.contentDocument.write(e),t.contentDocument.close(),t.contentWindow.focus(),setTimeout(()=>{t.contentWindow.print(),setTimeout(()=>{document.body.removeChild(t),r()},500)},300)})}function O({config:e,mesa:r,mozo:t,items:d,subtotal:i,descuento:o,propina:l,total:p,metodo:s,fecha:c}){const a=d.map(n=>`
    <tr>
      <td class="qty">${n.qty}x</td>
      <td class="nombre">${n.nombre}${n.nota?`<br><small class="nota">→ ${n.nota}</small>`:""}</td>
      <td class="precio">${u(n.precio*n.qty)}</td>
    </tr>
  `).join("");return`<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { margin: 4mm; size: ${e.paperWidth}mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 11px; width: ${e.paperWidth-8}mm; color: #000; }
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
    ${e.nombreLocal?`<div class="nombre-local">${e.nombreLocal}</div>`:""}
    ${e.direccion?`<div class="center">${e.direccion}</div>`:""}
    ${e.cuit?`<div class="center">CUIT: ${e.cuit}</div>`:""}
    ${e.telefono?`<div class="center">Tel: ${e.telefono}</div>`:""}
    <hr class="sep-solid">
    <table><tr>
      <td class="bold">Mesa ${r}</td>
      <td style="text-align:right">${c}</td>
    </tr></table>
    ${t?`<div>Mozo: ${t}</div>`:""}
    <hr class="sep">
    <table>${a}</table>
    <hr class="sep-solid">
    <table class="totales">
      ${o>0?`<tr><td class="label">Subtotal</td><td class="val">${u(i)}</td></tr>`:""}
      ${o>0?`<tr><td class="label">Descuento</td><td class="val">-${u(o)}</td></tr>`:""}
      ${l>0?`<tr><td class="label">Propina</td><td class="val">${u(l)}</td></tr>`:""}
      <tr class="total-row"><td class="label">TOTAL</td><td class="val">${u(p)}</td></tr>
    </table>
    <div class="metodo">Forma de pago: ${s}</div>
    <hr class="sep">
    <div class="pie">No es comprobante fiscal</div>
    ${e.mensajePie?`<div class="pie">${e.mensajePie}</div>`:""}
  </body></html>`}function A({config:e,mesa:r,mozo:t,items:d,fecha:i,copia:o=1,total:l=1}){const p=d.map(s=>{var c;return`
    <tr>
      <td class="qty bold">${s.qty}x</td>
      <td class="nombre">
        <strong>${s.nombre}</strong>
        ${s.nota?`<br><span class="nota">→ ${s.nota}</span>`:""}
        ${((c=s.modificadores)==null?void 0:c.map(a=>`<br><span class="mod">+ ${a}</span>`).join(""))||""}
      </td>
    </tr>
  `}).join("");return`<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page { margin: 4mm; size: ${e.paperWidth}mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 13px; width: ${e.paperWidth-8}mm; color: #000; }
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
    <div class="mesa">MESA ${r}</div>
    <table><tr><td>${t?`Mozo: ${t}`:""}</td><td style="text-align:right">${i}</td></tr></table>
    ${l>1?`<div class="copia">Copia ${o} de ${l}</div>`:""}
    <hr class="sep">
    <table>${p}</table>
    <hr class="sep">
    <div class="hora">${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</div>
  </body></html>`}async function q(e,r=null){const t=r||C();if(!t.method)throw new Error("Impresora no configurada. Andá a Configuración → Impresora y elegí un método.");const d=e.fecha||new Date().toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}),i={config:t,fecha:d,...e};if(t.method==="epson"&&x){const o=z(i);await S(o)}else{const o=O(i);await P(o)}}async function _(e,r=null){const t=r||C();if(!t.method)throw new Error("Impresora no configurada. Andá a Configuración → Impresora y elegí un método.");const d=e.fecha||new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),i=t.copiasComanda||1;for(let o=1;o<=i;o++){const l={config:t,fecha:d,copia:o,total:i,...e};t.method==="epson"&&x?await S(L(l)):await P(A(l)),o<i&&await new Promise(p=>setTimeout(p,400))}}export{_ as a,N as b,R as c,W as d,C as g,I as o,q as p,M as s};
