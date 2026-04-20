// Desktop sidebar — workspace switcher, nav, mailbox groups

function Avatar({ letter, color, size = 20 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.5), fontWeight: 700, flexShrink: 0, letterSpacing: -0.3,
    }}>{letter}</div>
  );
}

function NavItem({ icon, label, count, active, onClick, dark, t, accent }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 6,
        cursor: 'pointer', userSelect: 'none',
        background: active ? (dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)') : (hover ? t.bgHover : 'transparent'),
        color: active ? accent : t.sec,
        fontSize: 13, fontWeight: active ? 600 : 500, letterSpacing: -0.1,
        margin: '1px 6px',
      }}>
      <span style={{ color: active ? accent : t.ter, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count != null && <span style={{
        fontSize: 11, fontWeight: 600, color: active ? accent : t.ter,
        background: active ? (dark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.14)') : 'transparent',
        padding: active ? '1px 6px' : 0, borderRadius: 999, minWidth: 18, textAlign: 'center',
      }}>{count}</span>}
    </div>
  );
}

function MailboxRow({ mb, active, onClick, dark, t }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '4px 10px', borderRadius: 6,
        cursor: 'pointer', userSelect: 'none',
        background: active ? (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : (hover ? t.bgHover : 'transparent'),
        margin: '0 6px',
      }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: mb.color, flexShrink: 0 }}/>
      <span style={{ flex: 1, fontSize: 12.5, color: t.sec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: active ? 600 : 500 }}>{mb.name}</span>
      {mb.unread > 0 && <span style={{ fontSize: 10.5, fontWeight: 600, color: t.ter }}>{mb.unread}</span>}
    </div>
  );
}

function SectionLabel({ children, t, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px 6px',
      fontSize: 10.5, fontWeight: 700, color: t.ter,
      textTransform: 'uppercase', letterSpacing: 0.8,
    }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

function DesktopSidebar({ dark, section, setSection, mailboxFilter, setMailboxFilter }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const unreadMail = MAILBOXES.reduce((s, m) => s + m.unread, 0);
  const openTasks = KANBAN.open.length;

  return (
    <div style={{
      width: 244, height: '100%', background: t.bgSidebar,
      borderRight: `1px solid ${t.sep}`, display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Workspace switcher */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px',
        cursor: 'pointer',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: `linear-gradient(135deg, ${accent}, ${DT.violet})`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800,
        }}>П</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.label, letterSpacing: -0.1 }}>Плутон Эстейт</div>
          <div style={{ fontSize: 11, color: t.ter, marginTop: 1 }}>Kirill Aliev</div>
        </div>
        <div style={{ color: t.ter, display: 'flex' }}>{I.chevronDown(14)}</div>
      </div>

      {/* Search */}
      <div style={{ padding: '4px 10px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          borderRadius: 6, color: t.ter,
        }}>
          {I.search(14)}
          <span style={{ flex: 1, fontSize: 12.5, color: t.ter }}>Поиск и команды</span>
          <div style={{
            display: 'flex', gap: 2, fontSize: 10.5, fontWeight: 600,
            color: t.ter,
          }}>
            <span style={{ padding: '1px 4px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3 }}>⌘</span>
            <span style={{ padding: '1px 4px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3 }}>K</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {/* Main nav */}
        <div style={{ padding: '4px 0' }}>
          <NavItem icon={I.home(15)} label="Главная" active={section === 'home'} onClick={() => setSection('home')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.inbox(15)} label="Входящие" count={unreadMail} active={section === 'mail'} onClick={() => setSection('mail')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.kanban(15)} label="Задачи" count={openTasks} active={section === 'tasks'} onClick={() => setSection('tasks')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.wallet(15)} label="Финансы" active={section === 'finance'} onClick={() => setSection('finance')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.building(15)} label="Объекты" count={24} active={section === 'properties'} onClick={() => setSection('properties')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.users(15)} label="Контрагенты" active={section === 'contacts'} onClick={() => setSection('contacts')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.doc(15)} label="Документы" active={section === 'docs'} onClick={() => setSection('docs')} dark={dark} t={t} accent={accent}/>
          <NavItem icon={I.chart(15)} label="Аналитика" active={section === 'analytics'} onClick={() => setSection('analytics')} dark={dark} t={t} accent={accent}/>
        </div>

        {/* Mailbox groups */}
        <SectionLabel t={t} right={<span style={{ color: t.ter, cursor: 'pointer', display: 'flex' }}>{I.plus(12)}</span>}>Почтовые ящики</SectionLabel>
        {MAILBOXES.map(mb => (
          <MailboxRow key={mb.id} mb={mb} active={mailboxFilter === mb.id} onClick={() => { setMailboxFilter(mb.id); setSection('mail'); }} dark={dark} t={t}/>
        ))}

        <SectionLabel t={t} right={<span style={{ color: t.ter, cursor: 'pointer', display: 'flex' }}>{I.plus(12)}</span>}>Избранное</SectionLabel>
        <NavItem icon={I.star(14)} label="МРСК-П-3117" dark={dark} t={t} accent={accent}/>
        <NavItem icon={I.star(14)} label="Россети Урал" dark={dark} t={t} accent={accent}/>
        <NavItem icon={I.star(14)} label="Q2 выкуп объектов" dark={dark} t={t} accent={accent}/>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 10px', borderTop: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Avatar letter="К" color={DT.accent} size={22}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.label }}>Kirill</div>
          <div style={{ fontSize: 10.5, color: t.ter }}>aliev@pluton.estate</div>
        </div>
        <div style={{ color: t.ter, display: 'flex', cursor: 'pointer' }}>{I.settings(14)}</div>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopSidebar, Avatar, NavItem, SectionLabel });
