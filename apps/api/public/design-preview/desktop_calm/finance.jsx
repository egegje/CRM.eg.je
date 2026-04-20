// Desktop Finance — bank statement table

function fmtMoney(n) {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '−' : '') + s + ' ₽';
}

function StatCard({ label, value, count, color, icon, t, dark }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10, background: t.bgPane,
      border: `1px solid ${t.sep}`, flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, background: `${color}18`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div style={{ fontSize: 12, color: t.sec, fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: t.label, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {count != null && <div style={{ fontSize: 11.5, color: t.ter, marginTop: 4 }}>{count} операций</div>}
    </div>
  );
}

function DesktopFinance({ dark, aiEnabled }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgPane, minWidth: 0 }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.label, letterSpacing: -0.3 }}>Финансы</div>
        <span style={{ fontSize: 12, color: t.ter }}>·</span>
        <span style={{ fontSize: 12, color: t.sec, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {I.calendar(12)} {STATEMENT.period}
        </span>
        <div style={{ flex: 1 }}/>
        <IconBtn icon={I.download(14)} t={t} dark={dark} label="Экспорт"/>
        <IconBtn icon={I.plus(14)} t={t} dark={dark} primary accent={accent} label="Платёж"/>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px' }}>
        {/* Account card */}
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 14,
          background: `linear-gradient(135deg, ${accent}, ${DT.violet})`,
          color: '#fff',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.85 }}>Расчётный счёт</div>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'SF Mono, ui-monospace, monospace', letterSpacing: 0.3 }}>
            {STATEMENT.account}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.85 }}>Остаток</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(STATEMENT.total)}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <StatCard label="Расход" value={fmtMoney(-STATEMENT.expense)} count={STATEMENT.expenseCount} color={DT.red} icon={I.arrow_up(14)} t={t} dark={dark}/>
          <StatCard label="Поступление" value={fmtMoney(STATEMENT.income)} count={STATEMENT.incomeCount} color={DT.green} icon={I.arrow_down(14)} t={t} dark={dark}/>
          <StatCard label="Всего движений" value={String(STATEMENT.totalCount)} color={accent} icon={I.trending(14)} t={t} dark={dark}/>
        </div>

        {aiEnabled && (
          <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 16,
            background: dark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)',
            border: `1px solid ${dark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.15)'}`,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ color: accent, display: 'flex', marginTop: 2 }}>{I.sparkle(14)}</span>
            <div style={{ flex: 1, fontSize: 12.5, color: t.label, lineHeight: '18px' }}>
              <b style={{ fontWeight: 700 }}>AI-сводка за период:</b> расход снизился на 12% по сравнению с прошлым месяцем. Крупнейшая статья — выплата ООО «ПЛУТОН ЭСТЕЙТ» (50 000 ₽). Обнаружены 7 однотипных платежей Водоканалу СПб на общую сумму 2 712 ₽ — можно объединить в один акт.
            </div>
            <button style={chipStyle(t, dark, accent)}>Детали →</button>
          </div>
        )}

        {/* Table */}
        <div style={{
          border: `1px solid ${t.sep}`, borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '80px 1fr 1fr 140px 36px',
            padding: '10px 16px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            borderBottom: `1px solid ${t.sep}`,
            fontSize: 10.5, fontWeight: 700, color: t.ter, textTransform: 'uppercase', letterSpacing: 0.8,
          }}>
            <div>Дата</div>
            <div>Контрагент</div>
            <div>Назначение</div>
            <div style={{ textAlign: 'right' }}>Сумма</div>
            <div/>
          </div>
          {STATEMENT.transactions.map((tx, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 1fr 140px 36px', gap: 10,
              padding: '10px 16px', borderBottom: i < STATEMENT.transactions.length - 1 ? `1px solid ${t.sep}` : 'none',
              alignItems: 'center', fontSize: 12.5,
              cursor: 'pointer',
            }}>
              <div style={{ color: t.sec, fontFamily: 'SF Mono, ui-monospace, monospace', fontSize: 12 }}>{tx.date}.2026</div>
              <div style={{ color: t.label, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.counterparty}</div>
              <div style={{ color: t.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.purpose}</div>
              <div style={{
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                fontWeight: 600, color: tx.amount >= 0 ? DT.green : t.label,
              }}>{fmtMoney(tx.amount)}</div>
              <div style={{ color: t.ter, display: 'flex', justifyContent: 'center' }}>{I.more_h(14)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopFinance, fmtMoney });
