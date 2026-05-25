const E="mimenu_printer_config",y={method:"browser",epsonIp:"",epsonPort:8008,paperWidth:80,nombreLocal:"",direccion:"",cuit:"",telefono:"",mensajePie:"Gracias por su visita",autoPrintRecibo:!0,autoPrintComanda:!0,copiasComanda:1};function T(){try{const e=localStorage.getItem(E);return e?{...y,...JSON.parse(e)}:{...y}}catch{return{...y}}}function M(e){localStorage.setItem(E,JSON.stringify(e))}let g=null,x=null,$="disconnected";const v=new Set;function w(){v.forEach(e=>e($))}function I(e){return v.add(e),()=>v.delete(e)}function N(){return $}function R(e,a=8008){return new Promise((o,d)=>{var s;if(!((s=window.epson)!=null&&s.ePOSDevice)){d(new Error("SDK Epson no cargado. Verificá que epos-2.27.0.js está en /public/"));return}$="connecting",w(),g=new window.epson.ePOSDevice,g.connect(e,a,t=>{if(t!=="OK"&&t!=="SSL_CONNECT_OK"){$="error",w(),d(new Error(`No se pudo conectar a ${e}:${a} — ${t}`));return}g.createDevice("local_printer",g.DEVICE_TYPE_PRINTER,{crypto:!1,buffer:!1},(l,c)=>{if(c!=="OK"){$="error",w(),d(new Error(`Error al crear dispositivo: ${c}`));return}x=l,$="connected",w(),o()})})})}function W(){if(g)try{g.disconnect()}catch{}g=null,x=null,$="disconnected",w()}function C(e){return e===58?32:42}function b(e,a,o){const d=o-e.length-a.length;return e+" ".repeat(Math.max(1,d))+a}function m(e,a){const o=Math.max(0,Math.floor((a-e.length)/2));return" ".repeat(o)+e}function f(e="-",a=42){return e.repeat(a)}function u(e){return"$"+Math.round(e).toLocaleString("es-AR")}function z({config:e,mesa:a,mozo:o,items:d,subtotal:s,descuento:t,propina:l,total:c,metodo:i,fecha:p}){const r=C(e.paperWidth),n=[];return e.nombreLocal&&n.push(m(e.nombreLocal.toUpperCase(),r)),e.direccion&&n.push(m(e.direccion,r)),e.cuit&&n.push(m(`CUIT: ${e.cuit}`,r)),e.telefono&&n.push(m(`Tel: ${e.telefono}`,r)),n.push(f("=",r)),n.push(b(`Mesa ${a}`,p,r)),o&&n.push(`Mozo: ${o}`),n.push(f("-",r)),d.forEach(h=>{const D=h.nombre.length>r-12?h.nombre.substring(0,r-15)+"...":h.nombre;n.push(b(`${h.qty}x ${D}`,u(h.precio*h.qty),r)),h.nota&&n.push(`   * ${h.nota}`)}),n.push(f("-",r)),t>0&&(n.push(b("Subtotal",u(s),r)),n.push(b("Descuento",`-${u(t)}`,r))),l>0&&n.push(b("Propina",u(l),r)),n.push(f("=",r)),n.push(b("TOTAL",u(c),r)),n.push(f("=",r)),n.push(`Forma de pago: ${i}`),n.push(""),n.push(m("No es comprobante fiscal",r)),e.mensajePie&&n.push(m(e.mensajePie,r)),n.push(""),n.join(`
`)}function L({config:e,mesa:a,mozo:o,items:d,fecha:s,copia:t=1,total:l=1}){const c=C(e.paperWidth),i=[];return i.push(m("*** COMANDA ***",c)),i.push(f("=",c)),i.push(b(`MESA ${a}`,s,c)),o&&i.push(`Mozo: ${o}`),l>1&&i.push(m(`[Copia ${t} de ${l}]`,c)),i.push(f("=",c)),d.forEach(p=>{var r;i.push(`${p.qty}x  ${p.nombre}`),p.nota&&i.push(`   >> ${p.nota}`),(r=p.modificadores)!=null&&r.length&&p.modificadores.forEach(n=>i.push(`   + ${n}`))}),i.push(f("-",c)),i.push(m(`${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`,c)),i.push(""),i.join(`
`)}function S(e,{cut:a=!0,bold:o=!1}={}){return new Promise((d,s)=>{if(!x){s(new Error("Impresora Epson no conectada"));return}const t=x;t.addTextLang("es"),t.addTextSmooth(!0),o&&t.addTextStyle(!1,!1,!0,t.COLOR_1),t.addText(e),a&&(t.addFeedLine(4),t.addCut(t.CUT_FEED)),t.send(),t.onreceive=({success:l})=>{l?d():s(new Error("Error al imprimir"))},t.onerror=l=>s(new Error(`Error Epson: ${l.status}`))})}function P(e){return new Promise(a=>{const o=window.open("","_blank","width=1,height=1,top=-9999,left=-9999");if(!o){const t=document.createElement("iframe");t.style.cssText="position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;",document.body.appendChild(t),t.contentDocument.open(),t.contentDocument.write(e),t.contentDocument.close(),t.contentWindow.focus(),setTimeout(()=>{t.contentWindow.print(),setTimeout(()=>{try{document.body.removeChild(t)}catch{}a()},500)},300);return}o.document.open(),o.document.write(e),o.document.close();let d=!1;const s=()=>{if(!d){d=!0;try{o.focus(),o.print(),setTimeout(()=>{try{o.close()}catch{}a()},1e3)}catch{a()}}};o.document.readyState==="complete"?s():(o.onload=s,setTimeout(s,400))})}function O({config:e,mesa:a,mozo:o,items:d,subtotal:s,descuento:t,propina:l,total:c,metodo:i,fecha:p}){const r=d.map(n=>`
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
      <td class="bold">Mesa ${a}</td>
      <td style="text-align:right">${p}</td>
    </tr></table>
    ${o?`<div>Mozo: ${o}</div>`:""}
    <hr class="sep">
    <table>${r}</table>
    <hr class="sep-solid">
    <table class="totales">
      ${t>0?`<tr><td class="label">Subtotal</td><td class="val">${u(s)}</td></tr>`:""}
      ${t>0?`<tr><td class="label">Descuento</td><td class="val">-${u(t)}</td></tr>`:""}
      ${l>0?`<tr><td class="label">Propina</td><td class="val">${u(l)}</td></tr>`:""}
      <tr class="total-row"><td class="label">TOTAL</td><td class="val">${u(c)}</td></tr>
    </table>
    <div class="metodo">Forma de pago: ${i}</div>
    <hr class="sep">
    <div class="pie">No es comprobante fiscal</div>
    ${e.mensajePie?`<div class="pie">${e.mensajePie}</div>`:""}
  </body></html>`}function A({config:e,mesa:a,mozo:o,items:d,fecha:s,copia:t=1,total:l=1}){const c=d.map(i=>{var p;return`
    <tr>
      <td class="qty bold">${i.qty}x</td>
      <td class="nombre">
        <strong>${i.nombre}</strong>
        ${i.nota?`<br><span class="nota">→ ${i.nota}</span>`:""}
        ${((p=i.modificadores)==null?void 0:p.map(r=>`<br><span class="mod">+ ${r}</span>`).join(""))||""}
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
    <div class="mesa">MESA ${a}</div>
    <table><tr><td>${o?`Mozo: ${o}`:""}</td><td style="text-align:right">${s}</td></tr></table>
    ${l>1?`<div class="copia">Copia ${t} de ${l}</div>`:""}
    <hr class="sep">
    <table>${c}</table>
    <hr class="sep">
    <div class="hora">${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</div>
  </body></html>`}async function _(e,a=null){const o=a||T();if(!o.method)throw new Error("Impresora no configurada. Andá a Configuración → Impresora y elegí un método.");const d=e.fecha||new Date().toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}),s={config:o,fecha:d,...e};if(o.method==="epson"&&x){const t=z(s);await S(t)}else{const t=O(s);await P(t)}}async function q(e,a=null){const o=a||T();if(!o.method)throw new Error("Impresora no configurada. Andá a Configuración → Impresora y elegí un método.");const d=e.fecha||new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),s=o.copiasComanda||1;for(let t=1;t<=s;t++){const l={config:o,fecha:d,copia:t,total:s,...e};o.method==="epson"&&x?await S(L(l)):await P(A(l)),t<s&&await new Promise(c=>setTimeout(c,400))}}export{q as a,N as b,R as c,W as d,T as g,I as o,_ as p,M as s};
