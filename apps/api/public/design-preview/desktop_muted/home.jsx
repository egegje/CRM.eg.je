// Desktop Home / Dashboard — "briefing" landing

function ActivityRow({ icon, iconColor, title, meta, time, t, dark }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      borderRadius: 6, cursor: 'pointer',
      background: hover ? t.bgHover : 'transparent',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7, background: `${iconColor}18`, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: t.ter, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
      </div>
      <div style={{ fontSize: 11, color: t.ter, flexShrink: 0 }}>{time}</div>
    </div>
  );
}

function Panel({ title, action, children, t, dark, accent, icon, iconColor }) {
  return (
    <div style={{
      background: t.bgPane, border: `1px solid ${t.sep}`, borderRadius: 12,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${t.sep}`,
      }}>
        {icon && <span style={{ color: iconColor || accent, display: 'flex' }}>{icon}</span>}
        <div style={{ fontSize: 13, fontWeight: 700, color: t.label, letterSpacing: -0.1, flex: 1 }}>{title}</div>
        {action}
      </div>
      <div style={{ flex: 1, padding: 6, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

function DesktopHome({ dark, aiEnabled, onNav }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const unreadMail = MAILBOXES.reduce((s, m) => s + m.unread, 0);
  const overdue = KANBAN.open.filter(k => k.overdue).length;

  return (
    <div style={{ flex: 1, overflow: 'auto', background: t.bg, minWidth: 0 }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 28px 40px' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: t.ter, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
            Пятница, 19 апреля
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: t.label, letterSpacing: -0.8 }}>
            Доброе утро, Кирилл.
          </div>
        </div>

        {/* AI briefing hero */}
        {aiEnabled && (
          <div style={{
            padding: 20, borderRadius: 14, marginBottom: 18,
            background: dark
              ? `linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.10))`
              : `linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))`,
            border: `1px solid ${dark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)'}`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 180, height: 180, borderRadius: '50%', background: `${accent}15`, filter: 'blur(40px)' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
              <span style={{ color: accent, display: 'flex' }}>{I.sparkle(16)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1, textTransform: 'uppercase' }}>AI · Брифинг дня</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: t.label, lineHeight: '24px', letterSpacing: -0.2, maxWidth: 820, marginBottom: 14, position: 'relative' }}>
              У тебя <b style={{ color: DT.red }}>{overdue} просроченных задач</b>, включая налоговую отчётность.
              В почте <b style={{ color: accent }}>{unreadMail} непрочитанных</b> — самое срочное: Россети Урал ждут оценки работ по МРСК-П-3117.
              На счёте движение <b style={{ color: DT.green }}>+703 786 ₽</b> за месяц, расход на 12% ниже.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
              <button onClick={() => onNav('tasks')} style={chipStyle(t, dark, accent)}>→ К просроченным</button>
              <button onClick={() => onNav('mail')} style={chipStyle(t, dark, accent)}>→ Открыть Россети</button>
              <button style={chipStyle(t, dark)}>Составить план на день</button>
            </div>
          </div>
        )}

        {/* Quick metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Непрочитано', value: unreadMail, color: accent, icon: I.inbox(14), nav: 'mail' },
            { label: 'Открытых задач', value: KANBAN.open.length, color: DT.orange, icon: I.kanban(14), sub: `${overdue} просрочено`, nav: 'tasks' },
            { label: 'Баланс', value: '703 786 ₽', color: DT.green, icon: I.wallet(14), sub: '+12% к периоду', nav: 'finance' },
            { label: 'Объектов в работе', value: 24, color: DT.violet, icon: I.building(14), sub: '3 выкупа в апреле', nav: 'properties' },
          ].map(m => (
            <div key={m.label} onClick={() => onNav(m.nav)} style={{
              padding: '14px 16px', borderRadius: 10, background: t.bgPane,
              border: `1px solid ${t.sep}`, cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: `${m.color}18`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon}</div>
                <div style={{ fontSize: 11.5, color: t.sec, fontWeight: 500 }}>{m.label}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.label, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                {m.value}
              </div>
              {m.sub && <div style={{ fontSize: 11, color: t.ter, marginTop: 4 }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* 3-col panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14, minHeight: 340 }}>
          <Panel t={t} dark={dark} accent={accent} title="Срочно"
            icon={I.flame(14)} iconColor={DT.red}
            action={<span style={{ fontSize: 11, color: t.ter, cursor: 'pointer' }} onClick={() => onNav('tasks')}>Все →</span>}>
            {KANBAN.open.filter(k => k.overdue).slice(0, 5).map(k => (
              <ActivityRow key={k.id}
                icon={I.flame(14)} iconColor={DT.red}
                title={k.title}
                meta={k.project || 'Без проекта'}
                time={k.due}
                t={t} dark={dark}/>
            ))}
          </Panel>

          <Panel t={t} dark={dark} accent={accent} title="Непрочитанные"
            icon={I.inbox(14)} iconColor={accent}
            action={<span style={{ fontSize: 11, color: t.ter, cursor: 'pointer' }} onClick={() => onNav('mail')}>Все →</span>}>
            {MAIL_GROUPS.flatMap(g => g.items).filter(m => m.unread).slice(0, 4).map(m => {
              const mb = MAILBOXES.find(x => x.id === m.mailbox);
              return (
                <ActivityRow key={m.id}
                  icon={<div style={{ width: 6, height: 6, borderRadius: 2, background: mb?.color || accent }}/>}
                  iconColor={mb?.color || accent}
                  title={m.subject}
                  meta={m.fromName}
                  time={m.time}
                  t={t} dark={dark}/>
              );
            })}
          </Panel>

          <Panel t={t} dark={dark} accent={accent} title="Последние платежи"
            icon={I.wallet(14)} iconColor={DT.green}
            action={<span style={{ fontSize: 11, color: t.ter, cursor: 'pointer' }} onClick={() => onNav('finance')}>Все →</span>}>
            {STATEMENT.transactions.slice(0, 5).map((tx, i) => (
              <ActivityRow key={i}
                icon={I.arrow_up(13)} iconColor={DT.red}
                title={tx.counterparty}
                meta={tx.purpose}
                time={fmtMoney(tx.amount)}
                t={t} dark={dark}/>
            ))}
          </Panel>
        </div>

        {/* Calendar strip */}
        <div style={{ marginTop: 14 }}>
          <Panel t={t} dark={dark} accent={accent} title="Календарь недели"
            icon={I.calendar(14)} iconColor={accent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: '4px 6px 8px' }}>
              {[
                { d: 'ПН', n: 14, ev: [] },
                { d: 'ВТ', n: 15, ev: [{ t: 'Созвон Омск', c: accent }] },
                { d: 'СР', n: 16, ev: [{ t: 'Налоговая', c: DT.red }] },
                { d: 'ЧТ', n: 17, ev: [{ t: 'Рассылка', c: DT.orange }, { t: 'Отчёт', c: DT.blue }] },
                { d: 'ПТ', n: 18, ev: [{ t: 'Выкуп К.Маркса', c: DT.violet }], today: true },
                { d: 'СБ', n: 19, ev: [] },
                { d: 'ВС', n: 20, ev: [] },
              ].map((day, i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 8,
                  background: day.today ? `${accent}14` : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                  border: day.today ? `1px solid ${accent}` : `1px solid transparent`,
                  minHeight: 72,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: day.today ? accent : t.ter, letterSpacing: 0.6 }}>{day.d}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: day.today ? accent : t.label, letterSpacing: -0.3 }}>{day.n}</span>
                  </div>
                  {day.ev.map((e, j) => (
                    <div key={j} style={{
                      fontSize: 10.5, padding: '2px 5px', borderRadius: 3, marginBottom: 2,
                      background: `${e.c}22`, color: e.c, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{e.t}</div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopHome });
