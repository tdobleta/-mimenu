export default function PeriodSelector({ value, onChange }) {
  const options = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
  ];

  return (
    <div className="flex gap-0">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className="px-3 py-1.5 text-sm transition-colors"
          style={{
            borderBottom: value === o.key ? '2px solid #1D9E75' : '2px solid transparent',
            color: value === o.key ? '#1D9E75' : 'rgba(0,0,0,0.4)',
            fontWeight: value === o.key ? 500 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


