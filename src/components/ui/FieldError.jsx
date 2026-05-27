import { G } from '@/lib/glass';

/**
 * Muestra un mensaje de error inline debajo de un input.
 * Solo renderiza si `error` es truthy.
 *
 * @param {{ error: string | undefined | null }} props
 */
export default function FieldError({ error }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      style={{
        color: G.red,
        fontSize: 12,
        marginTop: 4,
        lineHeight: 1.3,
        fontWeight: 500,
      }}
    >
      {error}
    </div>
  );
}
