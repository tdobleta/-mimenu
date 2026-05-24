# mimenú — Relay LAN Local

Permite que las tablets y el monitor de cocina se comuniquen instantáneamente
en la misma red WiFi, **aunque se corte el internet**.

## Instalación (PC Caja, Windows)

### Opción A — Ejecutar manualmente

1. Instalar **Node.js 18+** desde https://nodejs.org
2. Abrir una terminal en esta carpeta:
   ```
   cd C:\mimenu\local-server
   npm install
   node server.js
   ```
3. Dejar la terminal abierta mientras el restaurante opera.

### Opción B — Auto-inicio con Windows (recomendado)

Usar **NSSM** (Non-Sucking Service Manager) para que inicie solo con Windows:

1. Descargar NSSM desde https://nssm.cc/download
2. Abrir cmd como Administrador y ejecutar:
   ```
   nssm install MimenuRelay "C:\Program Files\nodejs\node.exe" "C:\mimenu\local-server\server.js"
   nssm set MimenuRelay AppDirectory "C:\mimenu\local-server"
   nssm set MimenuRelay Start SERVICE_AUTO_START
   nssm start MimenuRelay
   ```
3. El relay inicia automáticamente con Windows.

### Opción C — Ejecutable .exe (sin Node.js)

1. Instalar pkg: `npm install -g pkg`
2. Compilar: `npm run build-exe`
3. Copiar `dist/mimenu-relay.exe` a la PC Caja y ejecutar.

## Verificación

Abrir en cualquier browser de la red: http://mimenu-caja.local:3001/health

Debe responder:
```json
{ "ok": true, "clients": 0, "uptime": 42 }
```

## Configuración en mimenú

1. Ir a **Configuración → Red local**
2. Activar el toggle
3. Probar conexión → debe mostrar "✓ Relay disponible"
4. Guardar

## Si mDNS no funciona en algunos Android

Ingresar la IP del servidor manualmente (ej: `ws://192.168.1.100:3001`).
La IP se puede ver en el relay: aparece en la consola al iniciar, o en la configuración
de red del PC.

## Puerto por defecto

`3001` — puede cambiarse con la variable de entorno `PORT`.
