export default function KPICard({ label, value, context, contextColor }) {
  return (
    <div className="p-[14px_16px]" style={{ 
      backgroundColor: 'var(--color-background-secondary)', 
      borderRadius: 8 
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(0,0,0,0.4)' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.5px', marginTop: 4 }}>
        {value}
      </div>
      {context && (
        <div style={{ fontSize: 11, color: contextColor || 'rgba(0,0,0,0.4)', marginTop: 2 }}>
          {context}
        </div>
      )}
    </div>
  );
}


