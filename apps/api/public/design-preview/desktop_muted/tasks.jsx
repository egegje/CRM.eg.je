// Desktop Tasks — Kanban view + List toggle

function priorityDot(p, size = 10) {
  const color = { urgent: DT.red, high: DT.orange, normal: DT.blue, low: DT.ter }[p] || DT.ter;
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }}/>;
}

function statusIcon(status, accent) {
  const map = {
    open: { icon: I.circle(14), color: '#A1A1AA' },
    in_progress: { icon: I.circle_progress(14), color: accent },
    done: { icon: I.circle_check(14), color: DT.green },
    cancelled: { icon: I.circle_x(14), color: '#71717A' },
  };
  const m = map[status] || map.open;
  return <span style={{ color: m.color, display: 'flex' }}>{m.icon}</span>;
}

function TaskCard({ task, status, dark, t, accent, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 12px', marginBottom: 6, borderRadius: 8,
        background: t.bgPane, border: `1px solid ${hover ? t.sepStrong : t.sep}`,
        cursor: 'pointer', boxShadow: hover ? (dark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)') : 'none',
        transition: 'all 0.1s',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <span style={{ marginTop: 1 }}>{statusIcon(status, accent)}</span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: t.label, lineHeight: '18px', letterSpacing: -0.1 }}>
          {task.title}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 22 }}>
        {task.project && (
          <span style={{
            fontSize: 10.5, fontWeight: 600, color: t.sec,
            background: t.bgHover, padding: '2px 6px', borderRadius: 3,
            maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{task.project}</span>
        )}
        {task.priority && task.priority !== 'low' && priorityDot(task.priority, 7)}
        {task.due && (
          <span style={{
            fontSize: 11, color: task.overdue ? DT.red : t.ter,
            display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: task.overdue ? 600 : 500,
          }}>
            {task.overdue ? I.flame(11) : I.clock(11)}
            {task.due}
          </span>
        )}
        <div style={{ flex: 1 }}/>
        <Avatar letter={(task.assignee || 'К')[0]} color={accent} size={16}/>
      </div>
    </div>
  );
}

function Column({ title, icon, color, count, children, dark, t }) {
  return (
    <div style={{
      width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
      borderRadius: 10, padding: '10px 8px', height: '100%',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 10px',
        borderBottom: `1px solid ${t.sep}`, marginBottom: 8,
      }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: t.label, letterSpacing: -0.1 }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: t.ter }}>{count}</span>
        <div style={{ flex: 1 }}/>
        <span style={{ color: t.ter, cursor: 'pointer', display: 'flex' }}>{I.plus(13)}</span>
        <span style={{ color: t.ter, cursor: 'pointer', display: 'flex' }}>{I.more_h(13)}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>{children}</div>
    </div>
  );
}

function DesktopTasks({ dark, aiEnabled }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const [view, setView] = React.useState('kanban');

  const cols = [
    { key: 'open', title: 'Открытые', icon: I.circle(14), color: DT.ter, items: KANBAN.open },
    { key: 'in_progress', title: 'В работе', icon: I.circle_progress(14), color: accent, items: KANBAN.in_progress },
    { key: 'done', title: 'Выполнено', icon: I.circle_check(14), color: DT.green, items: KANBAN.done },
    { key: 'cancelled', title: 'Отменено', icon: I.circle_x(14), color: DT.ter, items: KANBAN.cancelled },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgPane, minWidth: 0 }}>
      {/* header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.label, letterSpacing: -0.3 }}>Задачи</div>
        <span style={{ fontSize: 12, color: t.ter }}>·</span>
        <span style={{ fontSize: 12, color: t.sec }}>Все проекты</span>
        <span style={{ color: t.ter, display: 'flex' }}>{I.chevronDown(12)}</span>

        <div style={{ flex: 1 }}/>

        {/* View toggle */}
        <div style={{
          display: 'flex', padding: 2, background: t.bgHover, borderRadius: 6, gap: 1,
        }}>
          {['kanban', 'list'].map(v => (
            <div key={v} onClick={() => setView(v)} style={{
              padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              color: view === v ? t.label : t.sec,
              background: view === v ? t.bgPane : 'transparent',
              borderRadius: 4, boxShadow: view === v ? (dark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
            }}>{v === 'kanban' ? 'Канбан' : 'Список'}</div>
          ))}
        </div>
        <IconBtn icon={I.filter(14)} t={t} dark={dark} label="Фильтр"/>
        <IconBtn icon={I.plus(14)} t={t} dark={dark} primary accent={accent} label="Новая"/>
      </div>

      {/* AI focus hint */}
      {aiEnabled && (
        <div style={{
          margin: '12px 20px 0', padding: '10px 14px', borderRadius: 8,
          background: dark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)',
          border: `1px solid ${dark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.15)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: accent, display: 'flex' }}>{I.sparkle(14)}</span>
          <div style={{ flex: 1, fontSize: 12.5, color: t.label, lineHeight: '17px' }}>
            <b style={{ fontWeight: 700 }}>Фокус дня:</b> 6 просроченных задач. Рекомендую начать с <b style={{ color: accent }}>«Налоговая отчётность»</b> (high, просрочено 7 дней).
          </div>
          <button style={chipStyle(t, dark, accent)}>Составить план →</button>
        </div>
      )}

      {/* Body */}
      {view === 'kanban' ? (
        <div style={{ flex: 1, display: 'flex', gap: 10, padding: 12, overflow: 'hidden' }}>
          {cols.map(c => (
            <Column key={c.key} title={c.title} icon={c.icon} color={c.color} count={c.items.length} dark={dark} t={t}>
              {c.items.map(task => <TaskCard key={task.id} task={task} status={c.key} dark={dark} t={t} accent={accent}/>)}
            </Column>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {cols.map(c => (
            <div key={c.key}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 6px',
                fontSize: 11, fontWeight: 700, color: t.ter, textTransform: 'uppercase', letterSpacing: 0.8,
                background: dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
              }}>
                <span style={{ color: c.color, display: 'flex' }}>{c.icon}</span>
                {c.title} <span style={{ color: t.ter }}>{c.items.length}</span>
              </div>
              {c.items.map(task => (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
                  borderBottom: `1px solid ${t.sep}`, cursor: 'pointer',
                }}>
                  {statusIcon(c.key, accent)}
                  <span style={{ fontSize: 13, color: t.label, flex: 1, fontWeight: 500 }}>{task.title}</span>
                  {task.project && <span style={{ fontSize: 11, color: t.sec, background: t.bgHover, padding: '2px 6px', borderRadius: 3 }}>{task.project}</span>}
                  {task.priority && task.priority !== 'low' && priorityDot(task.priority, 7)}
                  {task.due && <span style={{ fontSize: 11.5, color: task.overdue ? DT.red : t.ter, minWidth: 90, textAlign: 'right' }}>{task.due}</span>}
                  <Avatar letter="К" color={accent} size={18}/>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DesktopTasks });
