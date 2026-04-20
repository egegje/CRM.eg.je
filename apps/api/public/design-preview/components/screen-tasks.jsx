// Tasks — Kanban + List

function PriorityIcon({ p }) {
  if (p === 'urgent') return L.flame(TOKENS.red, 14);
  if (p === 'high') return <div style={{ width: 8, height: 8, borderRadius: 99, background: TOKENS.orange }}/>;
  if (p === 'low') return <div style={{ width: 6, height: 6, borderRadius: 99, background: '#9CA3AF' }}/>;
  return <div style={{ width: 6, height: 6 }}/>;
}

function TaskCard({ task, color, dark }) {
  const t = theme(dark);
  return (
    <div style={{
      padding: 12, borderRadius: 14, background: t.card,
      border: `0.5px solid ${t.sep}`, marginBottom: 8,
      boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ paddingTop: 4, width: 14, display: 'flex', justifyContent: 'center' }}>
          <PriorityIcon p={task.priority}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: t.label, lineHeight: '18px', letterSpacing: -0.2 }}>{task.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
            {task.project && (
              <span style={{ fontSize: 10, color: t.ter, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                {L.folder(t.ter, 10)}{task.project.slice(0, 28)}
              </span>
            )}
            {task.due && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: task.overdue ? TOKENS.red : t.ter,
                display: 'inline-flex', gap: 3, alignItems: 'center',
                padding: task.overdue ? '2px 6px' : 0, borderRadius: 4,
                background: task.overdue ? TOKENS.redSoft : 'transparent',
              }}>
                {L.cal(task.overdue ? TOKENS.red : t.ter, 10)}{task.due}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksScreen({ dark }) {
  const t = theme(dark);
  const [view, setView] = React.useState('kanban');
  const [filter, setFilter] = React.useState('all');
  const columns = [
    { key: 'open', title: 'Открыта', color: TOKENS.accent, icon: '●', items: KANBAN.open },
    { key: 'in_progress', title: 'В работе', color: TOKENS.orange, icon: '◐', items: KANBAN.in_progress },
    { key: 'done', title: 'Выполнена', color: TOKENS.green, icon: '✓', items: KANBAN.done },
    { key: 'cancelled', title: 'Отменена', color: '#9CA3AF', icon: '✗', items: KANBAN.cancelled },
  ];
  const [col, setCol] = React.useState(0);
  const filters = [
    { k: 'mine', l: 'Мои' },
    { k: 'created', l: 'От меня' },
    { k: 'all', l: 'Все' },
    { k: 'overdue', l: 'Просрочка' },
    { k: 'done', l: 'Готово' },
  ];
  const current = columns[col];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>

      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>Задачи</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, color: t.label, letterSpacing: -0.8 }}>Канбан</h1>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{
              display: 'flex', padding: 2, borderRadius: 10,
              background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            }}>
              <button onClick={() => setView('kanban')} style={{
                width: 30, height: 30, border: 'none', borderRadius: 8, cursor: 'pointer',
                background: view === 'kanban' ? t.card : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: view === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{L.kanban(view === 'kanban' ? TOKENS.accent : t.sec, 16)}</button>
              <button onClick={() => setView('list')} style={{
                width: 30, height: 30, border: 'none', borderRadius: 8, cursor: 'pointer',
                background: view === 'list' ? t.card : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{L.list(view === 'list' ? TOKENS.accent : t.sec, 16)}</button>
            </div>
            <button style={{
              width: 36, height: 36, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentDeep})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 6px 16px ${TOKENS.accentGlow}`,
            }}>{L.plus('#fff', 18)}</button>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '14px 20px 8px', overflowX: 'auto' }}>
        {filters.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
            background: filter === f.k ? TOKENS.accent : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
            color: filter === f.k ? '#fff' : t.sec,
            fontSize: 13, fontWeight: 600, letterSpacing: -0.2, flexShrink: 0,
          }}>{f.l}</button>
        ))}
      </div>

      {/* Column tabs */}
      <div style={{
        display: 'flex', padding: '0 20px', gap: 4, marginBottom: 10,
        overflowX: 'auto',
      }}>
        {columns.map((c, i) => {
          const on = col === i;
          return (
            <button key={c.key} onClick={() => setCol(i)} style={{
              border: 'none', background: 'none', padding: '6px 0', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              flexShrink: 0, minWidth: 80,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: c.color }}/>
                <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? t.label : t.sec }}>{c.title}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                  background: on ? `${c.color}22` : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                  color: on ? c.color : t.ter,
                }}>{c.items.length}</span>
              </div>
              <div style={{
                height: 2, width: '100%', borderRadius: 99,
                background: on ? c.color : 'transparent',
              }}/>
            </button>
          );
        })}
      </div>

      {/* Task list for column */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 100px' }}>
        {current.items.map(task => (
          <TaskCard key={task.id} task={task} dark={dark}/>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TasksScreen });
