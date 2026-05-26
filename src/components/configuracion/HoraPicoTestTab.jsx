import { useMemo, useState } from 'react';
import {
  HORA_PICO_STEPS,
  buildHoraPicoEvidenceReport,
  groupStepsByPhase,
  summarizeHoraPicoRunbook,
} from '@/lib/horaPicoRunbook';
import { G } from '@/lib/glass';

const STORAGE_KEY = 'mimenu_hora_pico_runbook';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completed: [], notes: '', operator: '' };
  } catch {
    return { completed: [], notes: '', operator: '' };
  }
}

function saveState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusCopy(status) {
  if (status === 'ready_to_run') return { title: 'Checklist critico completo', color: '#1D9E75', bg: '#E8F7F2' };
  if (status === 'in_progress') return { title: 'Prueba en preparacion', color: '#D97706', bg: '#FEF3C7' };
  return { title: 'Todavia no iniciar prueba', color: '#DC2626', bg: '#FEE2E2' };
}

export default function HoraPicoTestTab() {
  const [state, setState] = useState(loadState);
  const completed = new Set(state.completed || []);
  const summary = useMemo(() => summarizeHoraPicoRunbook(HORA_PICO_STEPS, state.completed), [state.completed]);
  const grouped = useMemo(() => groupStepsByPhase(HORA_PICO_STEPS), []);
  const status = statusCopy(summary.status);

  function update(nextPatch) {
    const next = { ...state, ...nextPatch };
    setState(next);
    saveState(next);
  }

  function toggleStep(id) {
    const nextCompleted = completed.has(id)
      ? (state.completed || []).filter(x => x !== id)
      : [...(state.completed || []), id];
    update({ completed: nextCompleted });
  }

  function reset() {
    update({ completed: [], notes: '', operator: '' });
  }

  function exportEvidence() {
    const report = buildHoraPicoEvidenceReport({
      completedIds: state.completed,
      notes: state.notes,
      operator: state.operator,
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(`prueba-hora-pico-${date}.json`, report);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1040 }}>
      <div style={{ background: status.bg, border: `1px solid ${status.color}33`, borderRadius: 12, padding: 18, display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: status.color, marginBottom: 4 }}>{status.title}</div>
          <div style={{ fontSize: 13, color: G.textMid, lineHeight: '20px' }}>
            {summary.required_completed}/{summary.required_total} pasos criticos completos. {summary.completed}/{summary.total} pasos totales.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: status.color, lineHeight: 1 }}>{summary.required_percent}%</div>
          <div style={{ fontSize: 11, color: G.textMuted, marginTop: 4 }}>critico</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 800, color: G.textMuted }}>
          Responsable de prueba
          <input
            value={state.operator || ''}
            onChange={e => update({ operator: e.target.value })}
            placeholder="Nombre"
            style={{ padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, color: G.text }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', justifyContent: 'flex-end' }}>
          <button onClick={exportEvidence} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: '#1D9E75', color: '#FFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
            Exportar evidencia
          </button>
          <button onClick={reset} style={{ padding: '9px 14px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#FFF', color: G.text, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            Reiniciar
          </button>
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 800, color: G.textMuted }}>
        Notas de prueba
        <textarea
          value={state.notes || ''}
          onChange={e => update({ notes: e.target.value })}
          placeholder="Anotar dispositivos usados, red, sucursal, hallazgos y decisiones."
          rows={3}
          style={{ padding: 10, border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, color: G.text, resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {Object.entries(grouped).map(([phase, steps]) => (
          <section key={phase} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 900, color: G.text }}>
              {phase}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {steps.map(step => {
                const isDone = completed.has(step.id);
                return (
                  <button
                    key={step.id}
                    onClick={() => toggleStep(step.id)}
                    style={{
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #F1F5F9',
                      background: isDone ? '#F0FDF4' : '#FFFFFF',
                      padding: 13,
                      cursor: 'pointer',
                    }}>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <span style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: `1px solid ${isDone ? '#1D9E75' : '#CBD5E1'}`,
                        background: isDone ? '#1D9E75' : '#FFF',
                        color: '#FFF',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}>
                        {isDone ? 'OK' : ''}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13, color: G.text }}>{step.label}</strong>
                          {step.required && (
                            <span style={{ fontSize: 10, fontWeight: 900, color: '#DC2626', background: '#FEE2E2', borderRadius: 99, padding: '2px 6px' }}>
                              critico
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: G.textMid, lineHeight: '18px', marginTop: 4 }}>
                          {step.objective}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: G.textMuted, lineHeight: '16px', marginTop: 5 }}>
                          Evidencia: {step.evidence}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {summary.blocked.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#92400E', marginBottom: 7 }}>Pendiente antes de simular hora pico</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {summary.blocked.map(step => (
              <span key={step.id} style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 99, padding: '4px 8px' }}>
                {step.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
