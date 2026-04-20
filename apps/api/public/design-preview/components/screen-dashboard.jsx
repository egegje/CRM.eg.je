// Dashboard — the landing screen combining Mail + Tasks + Finance at a glance

function DashboardScreen({ dark, onNav }) {
  const t = theme(dark);
  const { aiEnabled } = React.useContext(window.AppCtx);
  const unreadCount = MAILBOXES.reduce((s, m) => s + m.unread, 0);
  const openTasks = KANBAN.open.length;
  const overdueTasks = KANBAN.open.filter(k => k.overdue).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>

      {/* Header */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, color: t.sec, letterSpacing: -0.2 }}>Воскресенье, 19 апреля</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, color: t.label, letterSpacing: -0.8 }}>
              Привет, Гнатюк
            </h1>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 99, cursor: 'pointer',
            background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.violet})`,
            color: '#fff', fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 6px 20px ${TOKENS.accentGlow}`,
          }}>ГН</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 110px' }}>
        {/* AI briefing card */}
        {aiEnabled && (
        <div style={{
          padding: 18, borderRadius: 22, position: 'relative', overflow: 'hidden',
          background: dark
            ? 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E1B4B 100%)'
            : 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 50%, #FDF4FF 100%)',
          border: `0.5px solid ${dark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)'}`,
        }}>
          <div style={{
            position: 'absolute', right: -20, top: -20, width: 120, height: 120,
            borderRadius: '50%', background: `radial-gradient(circle, ${TOKENS.accentGlow}, transparent 70%)`,
          }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            {L.sparkle(TOKENS.accent, 14)}
            <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>AI · Брифинг</span>
          </div>
          <div style={{ fontSize: 15, color: t.label, marginTop: 8, lineHeight: '21px', letterSpacing: -0.2, position: 'relative' }}>
            За выходные накопилось <b style={{ color: TOKENS.accent }}>13 писем</b> от контрагентов — 4 ждут ответа. В «Плутон Эстейт» просрочено <b style={{ color: TOKENS.red }}>7 задач</b>, из них 2 по объекту на К. Маркса. По счёту Сбербанк прошло <b>149 операций</b>, остаток <b>+703 786 ₽</b>.
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', position: 'relative' }}>
            <button style={{
              padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
              background: TOKENS.accent, color: '#fff',
              fontSize: 12, fontWeight: 600,
            }}>Показать приоритеты →</button>
            <button style={{
              padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
              color: TOKENS.accentDeep, fontSize: 12, fontWeight: 600,
            }}>Составить план дня</button>
          </div>
        </div>
        )}

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div onClick={() => onNav('mail')} style={statCard(t, dark)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${TOKENS.accent}22`, color: TOKENS.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{L.inbox(TOKENS.accent, 18)}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.accent, background: `${TOKENS.accent}18`, padding: '2px 7px', borderRadius: 99 }}>+3</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.label, marginTop: 10, letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums' }}>{unreadCount}</div>
            <div style={{ fontSize: 12, color: t.sec, marginTop: 2 }}>непрочитанных</div>
          </div>

          <div onClick={() => onNav('tasks')} style={statCard(t, dark)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${TOKENS.orange}22`, color: TOKENS.orange,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{L.kanban(TOKENS.orange, 18)}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.red, background: TOKENS.redSoft, padding: '2px 7px', borderRadius: 99 }}>{overdueTasks} проср.</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.label, marginTop: 10, letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums' }}>{openTasks}</div>
            <div style={{ fontSize: 12, color: t.sec, marginTop: 2 }}>открытых задач</div>
          </div>

          <div onClick={() => onNav('finance')} style={{...statCard(t, dark), gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14}}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(16,185,129,0.3)',
            }}>{L.wallet('#fff', 22)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.4, textTransform: 'uppercase' }}>Сбербанк · RUB</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.label, marginTop: 2, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                703 786,48 ₽
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.green, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                {L.arrowUp(TOKENS.green, 12)} 12.4%
              </div>
              <div style={{ fontSize: 10, color: t.ter, marginTop: 2 }}>за месяц</div>
            </div>
          </div>
        </div>

        {/* Today's priorities */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.label, letterSpacing: -0.5 }}>Фокус на сегодня</h2>
          <button style={{
            background: 'none', border: 'none', color: TOKENS.accent,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0,
          }}>Всё →</button>
        </div>

        <div style={{ borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}`, overflow: 'hidden' }}>
          {[
            { icon: L.flame, color: TOKENS.red, title: 'Налоговая отчётность', meta: 'Просрочено на 7 дн', tag: 'Срочно', tagColor: TOKENS.red },
            { icon: L.doc, color: TOKENS.orange, title: 'Выкуп «Карла Маркса, 11 490,2 кв»', meta: 'Дедлайн сегодня', tag: 'Объект', tagColor: TOKENS.orange },
            { icon: L.comment, color: TOKENS.accent, title: 'Ответить Россети Урал', meta: 'МРСК-П-3117 · оценка работ', tag: 'Почта', tagColor: TOKENS.accent },
          ].map((item, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderBottom: i < arr.length - 1 ? `0.5px solid ${t.sep}` : 'none',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${item.color}18`, color: item.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{item.icon(item.color, 18)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: t.ter, marginTop: 2 }}>{item.meta}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: item.tagColor,
                background: `${item.tagColor}18`, padding: '3px 8px', borderRadius: 99,
                textTransform: 'uppercase', letterSpacing: 0.3,
              }}>{item.tag}</span>
            </div>
          ))}
        </div>

        {/* Mini cash flow */}
        <div style={{ marginTop: 20, padding: 16, borderRadius: 20, background: t.card, border: `0.5px solid ${t.sep}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ter, letterSpacing: 0.4, textTransform: 'uppercase' }}>Денежный поток · апрель</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.label, marginTop: 2, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>+703 786 ₽</div>
            </div>
            <div style={{ fontSize: 12, color: t.sec }}>20 из 31 дн</div>
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 14, height: 60, alignItems: 'flex-end' }}>
            {[0.4, 0.6, 0.45, 0.8, 0.55, 0.9, 0.7, 0.85, 0.6, 0.95, 0.75, 1.0, 0.85].map((h, i) => (
              <div key={i} style={{
                flex: 1, height: `${h * 100}%`, borderRadius: 3,
                background: i === 11
                  ? `linear-gradient(180deg, ${TOKENS.accent}, ${TOKENS.accentDeep})`
                  : (dark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)'),
              }}/>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: t.ter, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>Приход</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.green, marginTop: 1 }}>+6.4М ₽</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.ter, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>Расход</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.red, marginTop: 1 }}>−5.7М ₽</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.ter, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>Операций</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.label, marginTop: 1 }}>149</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function statCard(t, dark) {
  return {
    padding: 14, borderRadius: 18, background: t.card,
    border: `0.5px solid ${t.sep}`, cursor: 'pointer',
    boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
    transition: 'transform 0.15s',
  };
}

Object.assign(window, { DashboardScreen });
