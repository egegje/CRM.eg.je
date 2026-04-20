// Finance — accounts + statement

function MiniChart({ data, color, dark }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 100, h = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3"/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#g-${color})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function fmt(n) {
  return Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ');
}

function FinanceScreen({ dark, onOpen }) {
  const t = theme(dark);
  const chartData = [1.2, 1.8, 1.5, 2.1, 1.9, 2.4, 2.3, 2.6, 2.4, 2.8, 2.7, 3.1];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>

      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>ИП Гнатюк</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, color: t.label, letterSpacing: -0.8 }}>Финансы</h1>
          </div>
          <button style={iconBtn(dark)}>{L.refresh(t.label, 17)}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 100px' }}>
        {/* Hero balance card */}
        <div style={{
          borderRadius: 24, padding: 22,
          background: `linear-gradient(135deg, #4F46E5 0%, #7C3AED 55%, #EC4899 100%)`,
          color: '#fff', position: 'relative', overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(79,70,229,0.3)',
        }}>
          <div style={{
            position: 'absolute', right: -40, top: -40, width: 180, height: 180,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.2), transparent)',
          }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, letterSpacing: 0.4, textTransform: 'uppercase' }}>Расчётный · ПАО Сбербанк</div>
            <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>• RUB</div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', position: 'relative' }}>
            40802 8109 5504 0002 879
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, marginTop: 12, letterSpacing: -1.5, position: 'relative' }}>
            703 786<span style={{ fontSize: 24, opacity: 0.7, fontWeight: 600 }}>,48</span> ₽
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2, position: 'relative' }}>Итого за период · 149 операций</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, position: 'relative' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>Приход</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {L.arrowDown('#A7F3D0', 12)} +6 421 180 ₽
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>Расход</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {L.arrowUp('#FCA5A5', 12)} −5 717 394 ₽
              </div>
            </div>
          </div>
        </div>

        {/* Chart card */}
        <div style={{
          marginTop: 12, padding: 16, borderRadius: 20, background: t.card,
          border: `0.5px solid ${t.sep}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.4, textTransform: 'uppercase' }}>Остаток · 30 дней</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: t.label, marginTop: 2, letterSpacing: -0.4 }}>+12.4%</div>
            </div>
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
              {['7д','1м','3м','1г'].map((p, i) => (
                <button key={p} style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: i === 1 ? t.card : 'transparent',
                  color: i === 1 ? t.label : t.ter,
                  fontSize: 11, fontWeight: 600,
                  boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, height: 80 }}>
            <svg width="100%" height="80" viewBox="0 0 340 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartG" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={TOKENS.accent} stopOpacity="0.3"/>
                  <stop offset="1" stopColor={TOKENS.accent} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {(() => {
                const pts = chartData.map((v, i) => {
                  const x = (i / (chartData.length - 1)) * 340;
                  const y = 75 - ((v - 1.2) / (3.1 - 1.2)) * 60;
                  return [x, y];
                });
                const d = pts.map((p, i) => i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`).join(' ');
                return <>
                  <path d={`${d} L340,80 L0,80 Z`} fill="url(#chartG)"/>
                  <path d={d} fill="none" stroke={TOKENS.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="4" fill={TOKENS.accent}/>
                  <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="8" fill={TOKENS.accent} opacity="0.2"/>
                </>;
              })()}
            </svg>
          </div>
        </div>

        {/* Second account */}
        <div style={{
          marginTop: 12, padding: 16, borderRadius: 20, background: t.card,
          border: `0.5px solid ${t.sep}`, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, fontWeight: 800,
          }}>$</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.label }}>Валютный USD</div>
            <div style={{ fontSize: 11, color: t.ter, fontFamily: 'ui-monospace, SF Mono, monospace', marginTop: 1 }}>40802 8405 0000 0007 812</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.label, letterSpacing: -0.4 }}>$12 840,75</div>
            <div style={{ fontSize: 11, color: t.ter, marginTop: 1 }}>≈ 1 180 543 ₽</div>
          </div>
        </div>

        {/* Transactions */}
        <div onClick={onOpen} style={{
          marginTop: 20, padding: 14, borderRadius: 16, background: t.card,
          border: `0.5px solid ${t.sep}`, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>Выписка по счёту</div>
            <div style={{ fontSize: 12, color: t.ter, marginTop: 2 }}>20.03 — 19.04 · 149 операций</div>
          </div>
          {L.chevronR(t.ter, 14)}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, paddingLeft: 4 }}>
          Последние операции
        </div>
        <div style={{ borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}`, overflow: 'hidden' }}>
          {STATEMENT.transactions.slice(0, 6).map((tx, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              borderBottom: i < 5 ? `0.5px solid ${t.sep}` : 'none',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: tx.amount > 0 ? TOKENS.greenSoft : TOKENS.redSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tx.amount > 0
                  ? L.arrowDown(TOKENS.green, 14)
                  : L.arrowUp(TOKENS.red, 14)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: t.label,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tx.counterparty}</div>
                <div style={{
                  fontSize: 11, color: t.ter, marginTop: 2, lineHeight: '14px',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>{tx.purpose}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: tx.amount > 0 ? TOKENS.green : t.label,
                  letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums',
                }}>{tx.amount > 0 ? '+' : '−'}{fmt(tx.amount)}</div>
                <div style={{ fontSize: 10, color: t.ter, marginTop: 1 }}>{tx.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatementScreen({ dark, onBack }) {
  const t = theme(dark);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>
      <div style={{ padding: '4px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', padding: '8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3, color: TOKENS.accent, fontSize: 17,
        }}>{L.chevronL(TOKENS.accent, 18)}<span style={{ fontWeight: 500 }}>Финансы</span></button>
        <button style={iconBtn(dark)}>{L.filter(t.label, 17)}</button>
      </div>
      <div style={{ padding: '8px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.6, textTransform: 'uppercase' }}>Выписка</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, color: t.label, letterSpacing: -0.4, fontFamily: 'ui-monospace, SF Mono, monospace' }}>
          40802 8109 5504 0002 879
        </h1>
        <div style={{ fontSize: 12, color: t.ter, marginTop: 4 }}>20.03.2026 — 19.04.2026</div>

        {/* Summary tiles */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[
            { l: 'Расход', n: '5 717 393,52', c: '136', color: TOKENS.red, sign: '−' },
            { l: 'Приход', n: '6 421 180,00', c: '13', color: TOKENS.green, sign: '+' },
            { l: 'Итого', n: '703 786,48', c: '149', color: TOKENS.accent, sign: '' },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, padding: 12, borderRadius: 14, background: t.card,
              border: `0.5px solid ${t.sep}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.ter, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.l}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: s.color, marginTop: 4, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums' }}>
                {s.sign}{s.n}
              </div>
              <div style={{ fontSize: 10, color: t.ter, marginTop: 1 }}>{s.c} оп.</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 100px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
          12 апреля 2026
        </div>
        <div style={{ borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}`, overflow: 'hidden' }}>
          {STATEMENT.transactions.map((tx, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              borderBottom: i < STATEMENT.transactions.length - 1 ? `0.5px solid ${t.sep}` : 'none',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: tx.amount > 0 ? TOKENS.greenSoft : TOKENS.redSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tx.amount > 0 ? L.arrowDown(TOKENS.green, 14) : L.arrowUp(TOKENS.red, 14)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: t.label, letterSpacing: -0.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tx.counterparty}</div>
                <div style={{
                  fontSize: 11, color: t.ter, marginTop: 2, lineHeight: '14px',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>{tx.purpose}</div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, textAlign: 'right', flexShrink: 0,
                color: tx.amount > 0 ? TOKENS.green : t.label,
                letterSpacing: -0.2, fontVariantNumeric: 'tabular-nums',
              }}>{tx.amount > 0 ? '+' : '−'}{fmt(tx.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FinanceScreen, StatementScreen });
