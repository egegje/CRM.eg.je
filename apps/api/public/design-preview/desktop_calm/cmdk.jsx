// Command palette — ⌘K

function CmdPalette({ open, onClose, onNav, dark, setDark, setMailboxFilter }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = React.useMemo(() => [
    { id: 'go-home', label: 'Открыть: Главная', kind: 'Переход', icon: I.home(15), action: () => onNav('home') },
    { id: 'go-mail', label: 'Открыть: Входящие', kind: 'Переход', icon: I.inbox(15), action: () => onNav('mail') },
    { id: 'go-tasks', label: 'Открыть: Задачи', kind: 'Переход', icon: I.kanban(15), action: () => onNav('tasks') },
    { id: 'go-finance', label: 'Открыть: Финансы', kind: 'Переход', icon: I.wallet(15), action: () => onNav('finance') },
    { id: 'go-props', label: 'Открыть: Объекты', kind: 'Переход', icon: I.building(15), action: () => onNav('properties') },
    { id: 'go-docs', label: 'Открыть: Документы', kind: 'Переход', icon: I.doc(15), action: () => onNav('docs') },
    { id: 'new-task', label: 'Создать задачу', kind: 'Действие', icon: I.plus(15), action: () => onNav('tasks') },
    { id: 'new-mail', label: 'Написать письмо', kind: 'Действие', icon: I.mail(15), action: () => onNav('mail') },
    { id: 'new-payment', label: 'Создать платёж', kind: 'Действие', icon: I.ruble(15), action: () => onNav('finance') },
    { id: 'toggle-theme', label: dark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему', kind: 'Настройки', icon: dark ? I.sun(15) : I.moon(15), action: () => setDark(!dark) },
    { id: 'ai-brief', label: 'AI: Брифинг дня', kind: 'AI', icon: I.sparkle(15), action: () => onNav('home') },
    { id: 'ai-draft', label: 'AI: Подготовить ответ', kind: 'AI', icon: I.sparkle(15), action: () => {} },
    ...MAILBOXES.map(mb => ({
      id: `mb-${mb.id}`, label: `Ящик: ${mb.name}`, kind: 'Ящики',
      icon: <div style={{ width: 10, height: 10, borderRadius: 3, background: mb.color }}/>,
      action: () => { setMailboxFilter(mb.id); onNav('mail'); },
    })),
  ], [dark, onNav, setDark, setMailboxFilter]);

  const filtered = q ? commands.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : commands;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const c = filtered[sel];
        if (c) { c.action(); onClose(); }
      }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, onClose]);

  if (!open) return null;

  // Group by kind
  const groups = {};
  filtered.forEach((c, i) => {
    if (!groups[c.kind]) groups[c.kind] = [];
    groups[c.kind].push({ ...c, _idx: i });
  });

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 120, animation: 'cmdIn 0.12s ease-out',
    }}>
      <style>{`@keyframes cmdIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxHeight: 480, display: 'flex', flexDirection: 'column',
        background: dark ? '#1A1A1F' : '#FFFFFF',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: dark
          ? '0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)',
      }}>
        {/* Input */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.sep}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: t.ter, display: 'flex' }}>{I.search(16)}</span>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
            placeholder="Найти команду, страницу, ящик…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, color: t.label, fontFamily: 'inherit',
            }}/>
          <kbd style={kbdStyle(t, dark)}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: t.ter, fontSize: 13 }}>
              Ничего не найдено
            </div>
          )}
          {Object.entries(groups).map(([kind, items]) => (
            <div key={kind}>
              <div style={{
                padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 700, color: t.ter,
                textTransform: 'uppercase', letterSpacing: 0.8,
              }}>{kind}</div>
              {items.map(c => (
                <div key={c.id} onClick={() => { c.action(); onClose(); }} onMouseEnter={() => setSel(c._idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 6, cursor: 'pointer', margin: '1px 0',
                    background: sel === c._idx ? (dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)') : 'transparent',
                    color: sel === c._idx ? accent : t.label,
                  }}>
                  <span style={{ color: sel === c._idx ? accent : t.ter, display: 'flex' }}>{c.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: sel === c._idx ? 600 : 500 }}>{c.label}</span>
                  {sel === c._idx && <kbd style={kbdStyle(t, dark)}>↵</kbd>}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${t.sep}`,
          display: 'flex', gap: 14, fontSize: 11, color: t.ter,
          background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}>
          <span><kbd style={kbdStyle(t, dark)}>↑</kbd><kbd style={kbdStyle(t, dark)}>↓</kbd> навигация</span>
          <span><kbd style={kbdStyle(t, dark)}>↵</kbd> выбрать</span>
          <div style={{ flex: 1 }}/>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{I.sparkle(11)} AI поиск</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CmdPalette });
