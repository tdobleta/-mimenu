# Plan de ejecucion: MiMenu al nivel Fudo

Estado: plan maestro vivo, basado en el codigo presente el 2026-05-25.
Objetivo: llevar MiMenu de app funcional amplia a POS profesional, simple de operar, confiable en servicio real y vendible a restaurantes.

## Norte del producto

MiMenu no debe competir por tener "mas pantallas". Debe competir por resolver el turno de un restaurante sin friccion:

- El mozo abre mesa, agrega items, manda cocina y cobra sin pensar en la arquitectura.
- Caja, stock, cocina, reportes, fiscal y pagos se actualizan como una sola consecuencia del negocio.
- Si internet cae, el local sigue operando dentro de reglas claras.
- Si algo no se puede completar, queda pendiente, visible y recuperable.
- El duenio no necesita saber de Supabase, queues, tokens ni errores tecnicos.

La meta practica es: facilidad operativa tipo Fudo, con una base local/offline mas resiliente.

## Diagnostico actual verificado en repo

| Area | Estado actual | Objetivo | Diagnostico |
|---|---:|---:|---|
| POS salon y cobro | 75% | 92% | Funciona, pero el cierre todavia mezcla RPC legacy, queue y operacion nueva. Falta consolidar efectos. |
| Offline queue | 65% | 90% | Soporta muchas operaciones y retry con jitter. Falta que cierre de mesa arrastre stock/caja/fiscal/auditoria como operacion completa. |
| Cold start offline | 55% | 85% | Existe `snapshotDB.js`. Hay que verificar que `store.jsx` guarda/carga mesas, turno activo y estado operativo suficiente. |
| Cocina | 65% | 90% | Hay pantalla, realtime, public/device-token path y relay local. Falta contrato claro: relay notifica, servidor confirma, offline muestra stale con certeza. |
| Caja | 70% | 90% | Turnos, retiros y cierres existen. Falta que caja sea consecuencia idempotente de operaciones, no suma fragil de updates. |
| Stock | 70% | 90% | Ingredientes, recetas, ingresos/egresos existen. Falta stock como efecto transaccional/reconciliable del cierre. |
| AFIP/fiscal | 40% | 85% | Hay UI, migraciones y funciones, pero `src/lib/afip.js` todavia contiene logica/credenciales del lado cliente. Debe pasar a servidor. |
| MercadoPago Point | 55% | 85% | Hay Edge Functions y settings. Falta persistencia de intentos, ownership fuerte, idempotencia estable y estados de timeout/reintento. |
| Equipo/permisos | 70% | 90% | `invite-member` existe. Falta auditar RLS real aplicada, grants, roles y flujo de dispositivos. |
| CRM/Delivery | 55% | 80% | Existen pantallas y migraciones. No son P0 para nivel Fudo; se endurecen despues del nucleo operativo. |
| Observabilidad/soporte | 35% | 85% | Falta trazabilidad por restaurante, sucursal, dispositivo, operation_id y version. |
| Instalacion local | 20% | 85% | Existe relay local. Falta decidir runtime: PWA avanzada, Tauri/Electron o agente local. |

## Principio tecnico central

MiMenu debe dejar de sincronizar "updates de UI" y pasar a sincronizar operaciones de negocio.

Ejemplo: cerrar mesa no es `turns.status = cerrada`.

Cerrar mesa es:

- identificar restaurante, sucursal, dispositivo, usuario/staff y mesa;
- congelar items, notas, modificadores y precios;
- registrar pago, descuento, propina y metodo;
- afectar caja;
- producir egresos de stock o dejar stock pendiente;
- crear intento fiscal o contingencia;
- actualizar reportes por consecuencia;
- emitir eventos a otros dispositivos;
- ser idempotente si se reintenta;
- quedar visible si falla.

El primer contrato ya esta iniciado en `src/lib/operations/closeTableOperation.js` y documentado en `docs/architecture/close-table-operation.md`. La prioridad es convertir ese contrato en el camino real del sistema.

## Sprint 0: Congelar base y verdad de Supabase

Objetivo: saber exactamente que esquema y funciones gobiernan produccion antes de tocar flujos criticos.

Archivos a revisar:

- `supabase/migrations/*.sql`
- `supabase/migrations/20260524000099_master_setup.sql`
- `supabase/schema.sql`
- `src/api/supabaseClient.js`
- `src/api/base44Client.js`
- `src/lib/store.jsx`
- `src/lib/offlineSync.js`

Trabajo:

- Comparar migraciones ordenadas vs master setup no trackeado como fuente oficial.
- Detectar duplicados o contradicciones entre migraciones.
- Auditar funciones `SECURITY DEFINER`: `cerrar_mesa_atomico`, `append_caja_retiro`, `decrement_stock`, puntos CRM.
- Auditar grants amplios sobre tablas sensibles.
- Verificar que RLS real no dependa de email fallback inseguro.
- Definir un solo camino de migracion: no mezclar "master setup" con migraciones incrementales sin control.

Criterio de salida:

- Documento corto con "DB esperada" y "DB real".
- Lista de SQL seguro para inspeccion.
- Ninguna migracion destructiva sin decision explicita.

## Sprint 1: Cierre de mesa como operacion completa

Objetivo: que `CLOSE_TABLE` sea la unidad central de verdad para cobro offline/online.

Archivos principales:

- `src/lib/operations/closeTableOperation.js`
- `src/components/salon/ComandaPanel.jsx`
- `src/pages/POSView.jsx`
- `src/lib/offlineSync.js`
- `src/lib/offlineQueue.js`
- `src/lib/cajaService.js`
- `src/lib/stockApi.js`
- `src/test/closeTableOperation.test.js`

Trabajo:

- Hacer que `offlineSync.js` lea `op.operation` cuando exista, con fallback legacy.
- Mantener compatibilidad con operaciones viejas en cola.
- Agregar validaciones minimas: branchId, turnId, total, payments_detail, device_id, operation_id.
- Pasar `operation_id` al camino servidor cuando exista.
- Preparar tabla futura `business_operations` o `sync_operations` para idempotencia server-side.
- No descontar stock dos veces: el cierre offline debe tener un solo lugar donde se aplican efectos.

Criterios de aceptacion:

- Cobro offline crea operacion durable en IndexedDB.
- Al reconectar, la mesa se cierra una sola vez aunque haya retries.
- Si el servidor responde "ya cerrado", se resuelve como idempotencia, no como error fatal.
- Si falla por conflicto real, queda en dead letter visible.
- Tests enfocados para shape de operacion y compatibilidad legacy.

## Sprint 2: Efectos derivados del cierre

Objetivo: caja, stock, fiscal y reportes nacen del cierre como consecuencias controladas.

Archivos principales:

- `src/lib/offlineSync.js`
- `src/lib/stockApi.js`
- `src/lib/cajaService.js`
- `src/pages/Caja.jsx`
- `src/pages/Stock.jsx`
- `src/components/facturacion/FacturaModal.jsx`
- `src/lib/afip.js`
- `supabase/functions/*`

Trabajo:

- Definir orden de aplicacion: cerrar turn -> caja -> stock movements -> fiscal pending -> audit/event.
- Crear idempotencia por `operation_id`.
- Stock: generar movimientos con referencia a operacion, no solo decrementos sueltos.
- Caja: totals deben poder reconstruirse desde turns/operaciones, no depender solo de acumulados.
- Fiscal: si offline, crear `facturas_contingencia` o estado pendiente, nunca simular CAE.

Criterios de aceptacion:

- Un cierre repetido no duplica caja ni stock.
- Una falla fiscal no deshace cobro ni caja; queda fiscal pendiente.
- Reportes leen datos consistentes despues de sync.

## Sprint 3: UX operacional nivel Fudo

Objetivo: reducir carga mental. El sistema guia, no expone arquitectura.

Archivos principales:

- `src/pages/Salon.jsx`
- `src/components/salon/ComandaPanel.jsx`
- `src/pages/CocinaDisplay.jsx`
- `src/pages/Caja.jsx`
- `src/components/OfflineBanner.jsx`
- `src/components/Layout.jsx`
- `src/components/Topbar.jsx`

Trabajo:

- Estados visibles por mesa: libre, ocupada, demorada, lista, pendiente_sync, pendiente_cobro, conflicto.
- Banner offline por pagina con accion concreta: "3 operaciones pendientes", "reintentar", "ver fallidas".
- Pantalla de recovery para dead letters.
- Mensajes de negocio, no mensajes tecnicos.
- Evitar bloqueos innecesarios: efectivo/manual puede cerrar offline; MP/AFIP quedan pendientes o bloqueados segun regla.

Criterios de aceptacion:

- Un mozo entiende que puede seguir trabajando sin internet.
- Un encargado puede ver que quedo pendiente y resolverlo.
- No hay errores silenciosos.

## Sprint 4: Seguridad y multi-tenant real

Objetivo: que un restaurante nunca pueda leer o mutar datos de otro, incluso con DevTools.

Archivos principales:

- `supabase/migrations/20260522000002_rls_policies.sql`
- `supabase/migrations/20260524000008_fix_rls_email_fallback.sql`
- `supabase/migrations/20260524000011_grant_fixes.sql`
- `supabase/functions/invite-member/index.ts`
- `src/lib/useUserRole.js`
- `src/components/configuracion/EquipoTab.jsx`

Trabajo:

- Confirmar que las policies finales usan `user_id`, no email secuestrable.
- Revisar `GRANT ALL` y justificar cada tabla.
- Agregar pruebas A/B de tenant isolation.
- Auditar Edge Functions que usan service_role: deben validar caller, restaurant y branch.
- Staff PIN: dejar de validar PIN sensible solo del lado cliente.

Criterios de aceptacion:

- Test automatizado demuestra que usuario A no ve datos de restaurante B.
- Cada Edge Function valida propiedad del recurso.
- Cocina publica usa device token validado, no acceso anon amplio.

## Sprint 5: AFIP/ARCA del lado servidor

Objetivo: facturacion profesional, segura y recuperable.

Archivos principales:

- `src/lib/afip.js`
- `src/components/facturacion/FacturaModal.jsx`
- `supabase/functions/facturar/index.ts`
- `supabase/migrations/20260524000001_facturas.sql`
- `supabase/migrations/20260524000009_facturas_contingencia.sql`
- `supabase/migrations/20260524000010_restaurant_settings_afip_full.sql`

Trabajo:

- Remover credenciales fiscales de browser/localStorage.
- Rehacer `facturar` como funcion real, no copia generica.
- Guardar intentos, errores, CAE, vencimiento, PDF/QR si aplica.
- Mapear errores TusFacturas/AFIP a mensajes operables.
- Integrar con cierre de mesa: factura ahora, factura pendiente o contingencia.

Criterios de aceptacion:

- Credenciales nunca aparecen en bundle ni localStorage.
- Factura emitida queda en historial.
- Error fiscal queda reintentable.

## Sprint 6: MercadoPago Point confiable

Objetivo: pagos con terminal sin duplicados ni estados fantasma.

Archivos principales:

- `supabase/functions/mp-payment-intent/index.ts`
- `supabase/functions/mp-payment-status/index.ts`
- `supabase/functions/mp-list-devices/index.ts`
- `supabase/functions/mp-test-device/index.ts`
- `src/components/salon/CloseTableModal.jsx`
- `src/pages/Configuracion.jsx`

Trabajo:

- Persistir payment intent con `operation_id`.
- Idempotency key estable: no `Date.now()` como unica proteccion.
- `mp-payment-status` debe validar restaurant/branch/turn ownership.
- Timeout de 60s con decision manual.
- Si internet cae despues del toque, el pago no queda en limbo: webhook/polling/recovery.

Criterios de aceptacion:

- Doble click no crea doble intent.
- Timeout muestra accion clara.
- Status polling no puede consultar intent de otro restaurante.

## Sprint 7: Cocina y operacion local

Objetivo: que cocina sea confiable en servicio y que el local pueda operar aun con internet inestable.

Archivos principales:

- `local-server/server.js`
- `src/lib/localRelay.js`
- `src/pages/CocinaDisplay.jsx`
- `src/pages/public/Cocina.jsx`
- `supabase/functions/cocina-update/index.ts`
- `supabase/migrations/20260524000006_device_tokens.sql`

Trabajo:

- Definir relay local como canal de notificacion, no fuente final de verdad.
- Autenticar/segmentar mensajes por branch/device.
- Mostrar ultima sync y estado offline de cocina.
- Usar cache local para continuidad visual.
- Evaluar runtime local: PWA instalada vs Tauri/Electron vs agente local para impresora/relay.

Criterios de aceptacion:

- Cocina no queda "ciega" sin avisar.
- Relay caido no rompe app.
- Device token revocable desde Configuracion.

## Sprint 8: Instalacion local y soporte

Objetivo: producto instalable y soportable en restaurantes reales.

Trabajo:

- Elegir runtime local con matriz: PWA, Tauri, Electron, agente Node.
- Definir update controlado: no reiniciar en plena cena.
- Soporte para impresoras, red local, cocina y caja.
- Health check local: DB, internet, relay, impresora, cola offline.
- Runbook de incidentes: sin internet, MP caido, AFIP caido, cola fallida.

Criterios de aceptacion:

- Se puede instalar en PC caja con instrucciones de una pagina.
- Soporte puede diagnosticar sin entrar a la DB a ciegas.

## Sprint 9: CRM, Delivery y crecimiento

Objetivo: completar valor comercial sin poner en riesgo el nucleo.

Archivos principales:

- `src/pages/Clientes.jsx`
- `src/lib/crmApi.js`
- `src/pages/Delivery.jsx`
- `supabase/migrations/20260523000001_crm.sql`
- `supabase/migrations/20260523000003_delivery.sql`

Trabajo:

- CRM: puntos/canje como operaciones auditables.
- Email/WhatsApp: opt-in, opt-out, rate limits, historial.
- Delivery manual solido antes de API PedidosYa/Rappi.
- Integraciones externas solo despues de tener webhooks y seguridad.

Criterios de aceptacion:

- Delivery manual no rompe caja/stock/cocina.
- CRM no permite mutar puntos sin auditoria.

## Orden inmediato recomendado

1. Sprint 0: auditoria Supabase/migraciones y verdad de DB.
2. Sprint 1: terminar compatibilidad `CLOSE_TABLE_OPERATION` en sync.
3. Sprint 2: tabla/flujo de operaciones idempotentes.
4. Sprint 3: UX de pendientes/conflictos para que el restaurante pueda operar.
5. Sprint 4: seguridad multi-tenant y Edge Functions.

No conviene meter mas features visibles antes de esto. Ya hay suficientes modulos; falta que el nucleo sea inevitablemente correcto.

## Definicion de "nivel Fudo" para MiMenu

MiMenu llega a nivel Fudo cuando:

- Un restaurante puede abrir, operar y cerrar turno completo sin ayuda tecnica.
- Las pantallas principales responden rapido y sin ambiguedad.
- Los errores se expresan como acciones de negocio.
- Caja y reportes cuadran despues de un turno con multiples dispositivos.
- Internet inestable no destruye la jornada.
- La configuracion inicial es simple.
- El duenio confia mas en el sistema que en una libreta.

Ese es el objetivo. No es una feature; es una disciplina de ejecucion.
