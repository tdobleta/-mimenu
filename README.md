# mimenú POS

Sistema de punto de venta (POS) para restaurantes. Gestión de mesas, comandas, cocina, stock, caja y analíticas — todo en uno, desde cualquier dispositivo.

**Demo:** https://mimenuar.netlify.app

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Deploy | Netlify (CI/CD automático) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Error tracking | Sentry |
| Uptime | UptimeRobot |
| Rate limiting | Upstash Redis |
| Pagos | MercadoPago Subscriptions |

---

## Features

- **POS táctil** — toma de pedidos optimizada para tablet
- **Salón con mapa de mesas** — visualización en tiempo real
- **Vista cocina** — comandas en tiempo real con estados (nueva → preparando → lista)
- **Caja con turnos** — apertura, cierre y arqueo
- **Stock y recetas** — ingredientes, food cost y egresos
- **Analíticas** — ventas, ticket promedio, productos top, hora pico
- **Offline-first** — funciona sin internet, sincroniza al reconectar
- **PWA** — instalable en tablet y celular sin App Store
- **Facturación AFIP** — integración con TusFacturasApp via Edge Function
- **Multi-tenant** — cada restaurante ve solo sus datos (RLS)

---

## Correr localmente

```bash
git clone https://github.com/tdobleta/-mimenu.git
cd -mimenu
npm install
cp .env.example .env.local   # completar con tus keys de Supabase
npm run dev
```

Abre en: http://localhost:5173

---

## Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## Base de datos

El schema completo está en `supabase/schema.sql`.

Para aplicar migraciones nuevas, ejecutarlas en orden en Supabase → SQL Editor:

```
supabase/migrations/migration_rls_completo_v3.sql
supabase/migrations/migration_cocina_estado.sql
supabase/migrations/migration_facturacion.sql
supabase/migrations/migration_suscripciones.sql
```

---

## Edge Functions

| Función | Descripción |
|---------|-------------|
| `facturar` | Emisión de facturas AFIP via TusFacturasApp |
| `chat` | Chatbot de soporte con Claude (Anthropic) |
| `suscripcion` | Gestión de suscripciones MercadoPago |

Para deployar:
```bash
supabase functions deploy facturar
supabase functions deploy chat
supabase functions deploy suscripcion
```

---

## Tests

```bash
npm run test           # correr tests una vez
npm run test:watch     # modo watch
npm run test:coverage  # con reporte de cobertura
```

39 tests — lógica crítica de cálculos, offline queue y conflict resolution.

---

## CI/CD

Cada push a `main` ejecuta automáticamente:
1. Tests unitarios
2. Build de producción

Si alguno falla, el deploy no se ejecuta.

---

## Estructura del proyecto

```
src/
├── components/
│   ├── configuracion/   # Tabs de configuración
│   ├── analytics/       # Componentes de analíticas
│   ├── salon/           # Componentes del salón
│   ├── facturacion/     # Facturación AFIP
│   └── ...
├── pages/
│   ├── legal/           # Términos y privacidad
│   └── ...
├── lib/
│   ├── store.jsx        # Estado global
│   ├── storeSelectors.js # Selectores para performance
│   ├── offlineQueue.js  # Cola offline IndexedDB
│   ├── offlineSync.js   # Motor de sincronización
│   └── ...
└── api/
    └── supabaseClient.js
supabase/
├── functions/           # Edge Functions
└── schema.sql           # Schema completo
```

---

## Disaster Recovery

Ver [RUNBOOK.md](./RUNBOOK.md) para procedimientos ante incidentes.

---

## Licencia

Propietario — © 2026 Martín Dobleta. Todos los derechos reservados.
