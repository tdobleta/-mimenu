// src/pages/legal/TerminosServicio.jsx
import { G } from '@/lib/glass';

export default function TerminosServicio() {
  const fecha = '15 de mayo de 2026';
  const cuit = '20-48394968-6';
  const email = 'soporte@mimenuar.netlify.app';

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif", color: '#111827', lineHeight: 1.7 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Términos y Condiciones de Servicio</h1>
        <p style={{ fontSize: 13, color: '#6B7280' }}>Última actualización: {fecha}</p>
      </div>

      <Section title="1. Partes del contrato">
        El presente contrato es celebrado entre <b>Martín Dobleta</b>, CUIT {cuit}, domiciliado en Mendoza, Argentina (en adelante "el Proveedor"), y la persona física o jurídica que contrata el servicio (en adelante "el Cliente").
      </Section>

      <Section title="2. Descripción del servicio">
        mimenú es un sistema de punto de venta (POS) para establecimientos gastronómicos, accesible vía web, que incluye gestión de mesas, comandas, stock, caja y analíticas. El servicio se presta bajo modalidad SaaS (Software como Servicio).
      </Section>

      <Section title="3. Registro y cuenta">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>El Cliente debe proporcionar información verdadera y actualizada al registrarse.</li>
          <li>El Cliente es responsable de mantener la confidencialidad de sus credenciales de acceso.</li>
          <li>El Proveedor puede suspender cuentas que violen estos términos.</li>
        </ul>
      </Section>

      <Section title="4. Planes y facturación">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>El servicio se ofrece en planes mensuales con renovación automática.</li>
          <li>Los precios están expresados en pesos argentinos e incluyen IVA.</li>
          <li>El cobro se realiza mediante MercadoPago al inicio de cada período.</li>
          <li>El Cliente puede cancelar en cualquier momento desde la sección de configuración.</li>
          <li>No se realizan reembolsos por períodos parciales.</li>
        </ul>
      </Section>

      <Section title="5. Disponibilidad del servicio">
        El Proveedor se compromete a mantener una disponibilidad del 99% mensual, excluyendo mantenimientos programados notificados con 24 horas de anticipación. El Proveedor no se responsabiliza por interrupciones causadas por terceros (proveedores de hosting, conectividad).
      </Section>

      <Section title="6. Datos del cliente">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Los datos del negocio (ventas, menú, clientes) son propiedad del Cliente.</li>
          <li>El Cliente puede exportar sus datos en cualquier momento desde la aplicación.</li>
          <li>Ante cancelación del servicio, los datos se conservan por 30 días y luego se eliminan definitivamente.</li>
          <li>El Proveedor no vende ni comparte datos con terceros.</li>
        </ul>
      </Section>

      <Section title="7. Limitación de responsabilidad">
        El Proveedor no será responsable por daños indirectos, pérdidas de ingresos o datos causados por el uso o imposibilidad de uso del servicio. La responsabilidad máxima del Proveedor se limita al monto abonado por el Cliente en los últimos 3 meses.
      </Section>

      <Section title="8. Propiedad intelectual">
        El software, diseño e interfaz de mimenú son propiedad del Proveedor. El Cliente obtiene una licencia de uso no exclusiva y no transferible durante la vigencia del contrato.
      </Section>

      <Section title="9. Modificaciones">
        El Proveedor puede modificar estos términos con 30 días de preaviso. Si el Cliente no acepta los nuevos términos, puede cancelar el servicio sin costo.
      </Section>

      <Section title="10. Jurisdicción">
        Cualquier controversia se someterá a la jurisdicción de los Tribunales Ordinarios de la Ciudad de Mendoza, Argentina, con renuncia a cualquier otro fuero que pudiera corresponder.
      </Section>

      <Section title="11. Contacto">
        Para consultas sobre estos términos: <a href={`mailto:${email}`} style={{ color: '#1D9E75' }}>{email}</a>
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
