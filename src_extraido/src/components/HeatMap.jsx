import { useState } from 'react';
import { DAY_NAMES } from '@/lib/utils-format';
import { formatCurrency } from '@/lib/utils-format';

const LEVELS = ['var(--color-background-secondary)', '#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 12);

function getLevel(value, max) {
  if (!value || value === 0) return 0;
  const pct = value / max;
  if (pct < 0.2) return 1;
  if (pct < 0.4) return 2;
  if (pct < 0.6) return 3;
  if (pct < 0.8) return 4;
  return 5;
}

export default function HeatMap({ data }) {
  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="bg-white p-[18px_20px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '1px' }}>
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              {HOURS.map(h => (
                <th key={h} style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 400, textAlign: 'center', padding: '0 0 4px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((day, di) => (
              <tr key={di}>
                <td style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', width: 32, textAlign: 'right', paddingRight: 6 }}>
                  {day}
                </td>
                {HOURS.map(h => {
                  const val = data.grid[di]?.[h] || 0;
                  const level = getLevel(val, data.maxVal);
                  return (
                    <td key={h} className="relative">
                      <div
                        className="cursor-pointer"
                        style={{
                          height: 22,
                          borderRadius: 2,
                          backgroundColor: LEVELS[level],
                          transition: 'opacity 150ms',
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.target.getBoundingClientRect();
                          setTooltip({ day, hour: h, amount: val, x: rect.left + rect.width / 2, y: rect.top - 8 });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div className="fixed z-50 bg-white px-2.5 py-1.5 pointer-events-none"
          style={{
            left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)',
            border: '0.5px solid hsl(var(--border))', borderRadius: 4, fontSize: 11,
          }}>
          {tooltip.day} {tooltip.hour}:00 — {formatCurrency(tooltip.amount)}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 justify-center" style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>
        <span>Menos ventas</span>
        {LEVELS.slice(1).map((c, i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c }} />
        ))}
        <span>Más ventas</span>
      </div>
    </div>
  );
}


