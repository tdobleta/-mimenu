import { useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils-format';

export default function TicketComparator({ turns }) {
  const [startA, setStartA] = useState('');
  const [endA, setEndA] = useState('');
  const [startB, setStartB] = useState('');
  const [endB, setEndB] = useState('');
  const [result, setResult] = useState(null);

  function compare() {
    const turnsA = turns.filter(t => t.fecha >= startA && t.fecha <= endA);
    const turnsB = turns.filter(t => t.fecha >= startB && t.fecha <= endB);

    const revA = turnsA.reduce((s, t) => s + (t.total_facturado || 0), 0);
    const ticketA = turnsA.length > 0 ? revA / turnsA.length : 0;

    const revB = turnsB.reduce((s, t) => s + (t.total_facturado || 0), 0);
    const ticketB = turnsB.length > 0 ? revB / turnsB.length : 0;

    const change = ticketA > 0 ? ((ticketB - ticketA) / ticketA) * 100 : 0;
    setResult({ ticketA, ticketB, change });
  }

  return (
    <div className="bg-white p-[18px_20px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Comparar dos períodos</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>Período A</label>
          <div className="flex gap-2">
            <input type="date" value={startA} onChange={e => setStartA(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm bg-white" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 4 }} />
            <input type="date" value={endA} onChange={e => setEndA(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm bg-white" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 4 }} />
          </div>
        </div>
        <div className="space-y-2">
          <label style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>Período B</label>
          <div className="flex gap-2">
            <input type="date" value={startB} onChange={e => setStartB(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm bg-white" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 4 }} />
            <input type="date" value={endB} onChange={e => setEndB(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm bg-white" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 4 }} />
          </div>
        </div>
      </div>
      <button
        onClick={compare}
        disabled={!startA || !endA || !startB || !endB}
        className="mt-3 px-4 py-2 text-white text-sm disabled:opacity-50"
        style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}
      >
        Comparar
      </button>

      {result && (
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
          <div className="text-center">
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>Período A</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{formatCurrency(result.ticketA)}</div>
          </div>
          <div className="text-center flex items-center justify-center">
            <span style={{ fontSize: 14, color: result.change >= 0 ? '#1D9E75' : '#DC3545', fontWeight: 500 }}>
              {result.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(result.change), false)}
            </span>
          </div>
          <div className="text-center">
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>Período B</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{formatCurrency(result.ticketB)}</div>
          </div>
        </div>
      )}
    </div>
  );
}


