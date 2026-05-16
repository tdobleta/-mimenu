# RUNBOOK — Disaster Recovery mimenú

Documento de referencia para incidentes en producción.
URL producción: https://mimenuar.netlify.app
Supabase: eoiwdmavwwapaqcchhrg.supabase.co

---

## Escenario 1 — La app no carga (pantalla blanca o error 500)

**Tiempo objetivo de resolución: < 15 minutos**

1. Verificar estado de Netlify: https://www.netlifystatus.com
2. Verificar estado de Supabase: https://status.supabase.com
3. Si ambos están OK, revisar el último deploy en Netlify → Deploys
4. Si el último deploy rompió algo → click en "Publish deploy" en el deploy anterior
5. Si el problema persiste, revisar Sentry para el error exacto

---

## Escenario 2 — Deploy roto en producción

**Tiempo objetivo: < 5 minutos**

1. Abrís https://app.netlify.com/projects/mimenuar/deploys
2. Buscás el último deploy que funcionaba (verde)
3. Click en ese deploy → **"Publish deploy"**
4. Netlify revierte en < 1 minuto sin necesidad de código

---

## Escenario 3 — Pérdida de datos en Supabase

**Tiempo objetivo: < 2 horas**

### Restaurar desde backup de GitHub Actions:

1. Abrís https://github.com/tdobleta/-mimenu/actions/workflows/backup.yml
2. Buscás el backup del día anterior → **Artifacts** → descargás el .sql.gz
3. Descomprimís: `gunzip backup_YYYY-MM-DD.sql.gz`
4. En Supabase SQL Editor, ejecutás el contenido del .sql
   - OJO: esto sobreescribe datos actuales. Solo hacer si hay pérdida real.

### Restaurar desde Supabase Storage:
1. Supabase → Storage → backups → año/mes → descargás el archivo
2. Mismo proceso que arriba

---

## Escenario 4 — Supabase completamente caído

**El POS sigue funcionando en modo offline gracias a IndexedDB.**
Los mozos pueden tomar pedidos — se sincronizan cuando vuelve Supabase.

1. Verificar https://status.supabase.com para ETA de resolución
2. Notificar a los clientes afectados por email
3. Los datos offline se sincronizan automáticamente al reconectar

---

## Escenario 5 — Credenciales comprometidas

### Si se filtra la Supabase anon key:
1. Supabase → Settings → API Keys → **Revoke** la key comprometida
2. Generar nueva key
3. Actualizar en Netlify → Environment Variables → VITE_SUPABASE_ANON_KEY
4. Trigger manual deploy en Netlify

### Si se filtra la Anthropic API key:
1. console.anthropic.com → API Keys → **Delete** la key
2. Generar nueva key
3. Supabase → Edge Functions → Secrets → actualizar ANTHROPIC_API_KEY

### Si se filtra el service role key de Supabase:
1. Supabase → Settings → API → **Rotate** service role key
2. Actualizar en GitHub Secrets → SUPABASE_SERVICE_ROLE_KEY

---

## Escenario 6 — Base de datos corrupta o datos incorrectos

1. Identificar el turno o tabla afectada
2. Revisar audit_logs para ver qué operación causó el problema
3. Corregir manualmente desde Supabase → Table Editor
4. Si el daño es masivo → restaurar desde backup (ver Escenario 3)

---

## Contactos de emergencia

| Servicio    | Soporte                          |
|-------------|----------------------------------|
| Netlify     | https://www.netlify.com/support/ |
| Supabase    | https://supabase.com/support     |
| Anthropic   | https://support.anthropic.com    |
| Upstash     | https://upstash.com/support      |

---

## Checklist post-incidente

- [ ] Documentar qué pasó y cuándo
- [ ] Documentar cómo se resolvió
- [ ] Notificar a clientes afectados
- [ ] Actualizar este runbook si encontraste algo que faltaba
- [ ] Agregar test o alerta para detectar el problema más rápido la próxima vez
