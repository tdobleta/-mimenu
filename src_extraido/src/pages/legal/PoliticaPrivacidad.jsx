// src/pages/legal/PoliticaPrivacidad.jsx
export default function PoliticaPrivacidad() {
  const fecha = '15 de mayo de 2026';
  const cuit = '20-48394968-6';
  const email = 'soporte@mimenuar.netlify.app';

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif", color: '#111827', lineHeight: 1.7 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Política de Privacidad</h1>
        <p style={{ fontSize: 13, color: '#6B7280' }}>Última actualización: {fecha}</p>
      </div>

      <Section title="1. Responsable del tratamiento">
        <b>Martín Dobleta</b>, CUIT {cuit}, Mendoza, Argentina. Contacto: <a href={`mailto:${email}`} style={{ color: '#1D9E75' }}>{email}</a>
      </Section>

      <Section title="2. Datos que recopilamos">
        <b>Datos de registro:</b> nombre, email y datos del negocio al crear una cuenta.
        <br /><br />
        <b>Datos operativos:</b> ventas, pedidos, menú, stock y datos de operación del restaurante.
        <br /><br />
        <b>Datos técnicos:</b> logs de errores, métricas de uso anónimas para mejorar el servicio.
        <br /><br />
        <b>No recopilamos:</b> datos de tarjetas de crédito (procesados directamente por MercadoPago), datos biométricos ni datos de clientes finales del restaurante.
      </Section>

      <Section title="3. Finalidad del tratamiento">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Prestar el servicio contratado</li>
          <li>Facturación y cobro del servicio</li>
          <li>Soporte técnico</li>
          <li>Mejora del producto (datos anónimos y agregados)</li>
          <li>Comunicaciones sobre el servicio (no publicidad de terceros)</li>
        </ul>
      </Section>

      <Section title="4. Base legal">
        El tratamiento se basa en la ejecución del contrato de servicio y el cumplimiento de obligaciones legales bajo la <b>Ley 25.326 de Protección de Datos Personales</b> de la República Argentina.
      </Section>

      <Section title="5. Destinatarios de los datos">
        Los datos pueden ser compartidos únicamente con:
        <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li><b>Supabase Inc.</b> — proveedor de base de datos e infraestructura (USA, Privacy Shield)</li>
          <li><b>Netlify Inc.</b> — proveedor de hosting (USA)</li>
          <li><b>Sentry</b> — monitoreo de errores (datos técnicos anónimos)</li>
          <li><b>MercadoPago</b> — procesamiento de pagos</li>
        </ul>
        No vendemos ni compartimos datos con terceros para fines comerciales.
      </Section>

      <Section title="6. Conservación de datos">
        Los datos se conservan durante la vigencia del contrato y 30 días adicionales tras la cancelación, período en el que el Cliente puede solicitar su exportación. Transcurrido ese plazo, los datos se eliminan de forma definitiva.
      </Section>

      <Section title="7. Derechos del titular">
        De acuerdo con la Ley 25.326, el titular tiene derecho a:
        <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li><b>Acceso:</b> solicitar una copia de sus datos</li>
          <li><b>Rectificación:</b> corregir datos inexactos</li>
          <li><b>Cancelación:</b> solicitar la eliminación de sus datos</li>
          <li><b>Exportación:</b> descargar sus datos en formato JSON/CSV desde la aplicación</li>
        </ul>
        Para ejercer estos derechos: <a href={`mailto:${email}`} style={{ color: '#1D9E75' }}>{email}</a>
      </Section>

      <Section title="8. Seguridad">
        Implementamos medidas técnicas y organizativas para proteger los datos:
        <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Cifrado en tránsito (HTTPS/TLS)</li>
          <li>Row Level Security en base de datos</li>
          <li>Backups diarios automáticos</li>
          <li>Credenciales sensibles almacenadas en vault cifrado</li>
          <li>Acceso restringido por roles</li>
        </ul>
      </Section>

      <Section title="9. Cookies">
        La aplicación utiliza cookies técnicas necesarias para el funcionamiento (autenticación de sesión). No utilizamos cookies de seguimiento ni publicidad.
      </Section>

      <Section title="10. Cambios en la política">
        Notificaremos cambios significativos por email con 30 días de anticipación.
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#374151' }}>{children}</div>
    </div>
  );
}
