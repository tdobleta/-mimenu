// local-server/server.js
// Relay LAN para mimenú — permite que tablets y monitor cocina se comuniquen
// en la misma red WiFi aunque se corte el internet.
//
// Instalación (PC Caja, Windows):
//   npm install
//   node server.js
//
// Auto-inicio con Windows (usando NSSM):
//   nssm install MimenuRelay "node" "C:\mimenu\local-server\server.js"
//   nssm set MimenuRelay Start SERVICE_AUTO_START
//   nssm start MimenuRelay
//
// Las tablets se conectan a ws://mimenu-caja.local:3001 (mDNS, sin importar la IP).
// Si mDNS no funciona en algún dispositivo Android, usar la IP manual desde /configuracion.

const express    = require('express');
const http       = require('http');
const { WebSocketServer } = require('ws');
const { Bonjour } = require('bonjour-service');

const PORT = parseInt(process.env.PORT || '3001', 10);

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const bonjour = new Bonjour();

// ── Health check (HTTP) ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    clients: wss.clients.size,
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
  });
});

// ── Relay WebSocket ─────────────────────────────────────────────────────────────
// Cualquier mensaje que llega se reenvía a TODOS los clientes conectados excepto el emisor.
// El protocolo es JSON: { type, branchId, ...payload }
// El branchId permite que un solo relay sirva múltiples sucursales en la misma red.

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[relay] cliente conectado: ${ip} (total: ${wss.clients.size})`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Broadcast a todos menos el emisor
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1 /* OPEN */) {
          client.send(raw.toString());
        }
      });
    } catch (e) {
      // Ignorar mensajes mal formados — no crashear el relay
    }
  });

  ws.on('close', () => {
    console.log(`[relay] cliente desconectado: ${ip} (quedan: ${wss.clients.size - 1})`);
  });

  ws.on('error', (err) => {
    console.error(`[relay] error en cliente ${ip}:`, err.message);
  });
});

// ── Heartbeat: detectar clientes fantasma ────────────────────────────────────────
// Cada 30s se envía un ping. Si no responde, se termina la conexión.
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

// ── mDNS: publicar hostname mimenu-caja.local ────────────────────────────────────
// Esto permite que las tablets descubran el relay por nombre en vez de por IP.
// Resolución nativa en Windows 10+, macOS, iOS. En Android puede requerir mDNS app.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  mimenú LAN relay`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  ws://mimenu-caja.local:${PORT}  ← nombre (mDNS)`);
  console.log(`  http://localhost:${PORT}/health  ← estado`);
  console.log(`  Clientes conectados: 0`);
  console.log(`\n  Dejá esta ventana abierta mientras el restaurante esté operando.\n`);

  try {
    bonjour.publish({
      name: 'mimenu-caja',
      type: '_http._tcp',
      port: PORT,
      txt: { version: '1.0.0' },
    });
    console.log(`  [mDNS] publicado como mimenu-caja.local`);
  } catch (e) {
    console.warn(`  [mDNS] no disponible — usá la IP manual en Configuración: ${e.message}`);
  }
});

// ── Shutdown limpio ──────────────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[relay] cerrando...');
  bonjour.unpublishAll(() => {
    server.close(() => {
      console.log('[relay] cerrado.');
      process.exit(0);
    });
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
