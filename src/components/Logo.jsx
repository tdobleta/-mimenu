export default function Logo({ size = 19, className = '' }) {
  return (
    <span className={`inline-flex items-baseline ${className}`} style={{ fontSize: size, fontWeight: 500, letterSpacing: '-0.5px' }}>
      <span className="text-white">mi</span>
      <span style={{ color: '#1D9E75' }}>menú</span>
    </span>
  );
}


