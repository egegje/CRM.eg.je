// App root — navigation, theme, tweaks wiring

const AppCtx = React.createContext({ aiEnabled: true, setAi: () => {} });
window.AppCtx = AppCtx;

function App() {
  const TWEAKS = /*EDITMODE-BEGIN*/{
    "accent": "#6366F1",
    "dark": false,
    "density": "comfortable",
    "showDualDevice": false,
    "aiEnabled": true
  }/*EDITMODE-END*/;

  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const saved = localStorage.getItem('crm-tweaks');
      if (saved) return { ...TWEAKS, ...JSON.parse(saved) };
    } catch {}
    return TWEAKS;
  });
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [active, setActive] = React.useState(() => localStorage.getItem('crm-tab') || 'dashboard');
  const [modal, setModal] = React.useState(null); // e.g. 'mail-thread', 'finance-statement'
  const [modalMsg, setModalMsg] = React.useState(null);

  // Apply accent override
  React.useEffect(() => {
    TOKENS.accent = tweaks.accent;
    TOKENS.accentDeep = darken(tweaks.accent, 0.12);
    TOKENS.accentSoft = hexAlpha(tweaks.accent, 0.12);
    TOKENS.accentGlow = hexAlpha(tweaks.accent, 0.35);
  }, [tweaks.accent]);

  const updateTweaks = (edits) => {
    const next = { ...tweaks, ...edits };
    setTweaks(next);
    try { localStorage.setItem('crm-tweaks', JSON.stringify(next)); } catch {}
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
  };

  React.useEffect(() => {
    localStorage.setItem('crm-tab', active);
  }, [active]);

  // edit mode protocol
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dark = tweaks.dark;

  const screen = () => {
    if (modal === 'mail-thread') {
      return <MailThreadScreen dark={dark} msg={modalMsg} onBack={() => setModal(null)}/>;
    }
    if (modal === 'finance-statement') {
      return <StatementScreen dark={dark} onBack={() => setModal(null)}/>;
    }
    switch (active) {
      case 'dashboard': return <DashboardScreen dark={dark} onNav={setActive}/>;
      case 'mail': return <MailScreen dark={dark} onOpen={(m) => { setModalMsg(m); setModal('mail-thread'); }}/>;
      case 'tasks': return <TasksScreen dark={dark}/>;
      case 'finance': return <FinanceScreen dark={dark} onOpen={() => setModal('finance-statement')}/>;
      case 'profile': return <ProfileScreen dark={dark}/>;
      default: return <DashboardScreen dark={dark} onNav={setActive}/>;
    }
  };

  const devices = tweaks.showDualDevice
    ? [{ dark: false, label: 'Light' }, { dark: true, label: 'Dark' }]
    : [{ dark, label: null }];

  return (
    <AppCtx.Provider value={{ aiEnabled: tweaks.aiEnabled !== false, setAi: (v) => updateTweaks({ aiEnabled: v }) }}>
    <div style={{
      minHeight: '100vh', background: dark ? '#0A0A0B' : '#EFEFF4',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px',
      fontFamily: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
        {devices.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Device dark={d.dark}>
              {tweaks.showDualDevice ? (
                <DualRoot dark={d.dark} active={active} setActive={setActive} modal={modal} setModal={setModal} modalMsg={modalMsg} setModalMsg={setModalMsg}/>
              ) : (
                <>
                  {screen()}
                  {!modal && (
                    <CustomTabBar active={active} onChange={setActive} dark={dark}/>
                  )}
                </>
              )}
            </Device>
            {d.label && (
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#6B7280', letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>{d.label}</div>
            )}
          </div>
        ))}
      </div>

      {tweaksOpen && (
        <TweaksPanel tweaks={tweaks} update={updateTweaks} onClose={() => setTweaksOpen(false)} active={active}/>
      )}
    </div>
    </AppCtx.Provider>
  );
}

function DualRoot({ dark, active, setActive, modal, setModal, modalMsg, setModalMsg }) {
  const screen = () => {
    if (modal === 'mail-thread') return <MailThreadScreen dark={dark} msg={modalMsg} onBack={() => setModal(null)}/>;
    if (modal === 'finance-statement') return <StatementScreen dark={dark} onBack={() => setModal(null)}/>;
    switch (active) {
      case 'dashboard': return <DashboardScreen dark={dark} onNav={setActive}/>;
      case 'mail': return <MailScreen dark={dark} onOpen={(m) => { setModalMsg(m); setModal('mail-thread'); }}/>;
      case 'tasks': return <TasksScreen dark={dark}/>;
      case 'finance': return <FinanceScreen dark={dark} onOpen={() => setModal('finance-statement')}/>;
      case 'profile': return <ProfileScreen dark={dark}/>;
      default: return <DashboardScreen dark={dark} onNav={setActive}/>;
    }
  };
  return (
    <>
      {screen()}
      {!modal && <CustomTabBar active={active} onChange={setActive} dark={dark}/>}
    </>
  );
}

function TweaksPanel({ tweaks, update, onClose, active }) {
  const accents = [
    { hex: '#6366F1', name: 'Indigo' },
    { hex: '#8B5CF6', name: 'Violet' },
    { hex: '#EC4899', name: 'Pink' },
    { hex: '#F97316', name: 'Orange' },
    { hex: '#10B981', name: 'Emerald' },
    { hex: '#0EA5E9', name: 'Sky' },
    { hex: '#EF4444', name: 'Red' },
    { hex: '#0A0A0B', name: 'Noir' },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, width: 300, zIndex: 100,
      background: tweaks.dark ? 'rgba(22,22,25,0.95)' : 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderRadius: 20, padding: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
      border: tweaks.dark ? '0.5px solid rgba(255,255,255,0.1)' : '0.5px solid rgba(0,0,0,0.06)',
      color: tweaks.dark ? '#fff' : '#0A0A0B',
      fontFamily: '-apple-system, system-ui',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {L.sparkle(tweaks.accent, 14)}
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>Tweaks</span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: tweaks.dark ? '#A1A1AA' : '#9CA3AF',
          fontSize: 18, padding: 0, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: tweaks.dark ? '#71717A' : '#9CA3AF', marginBottom: 8 }}>Акцент</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
        {accents.map(a => (
          <button key={a.hex} onClick={() => update({ accent: a.hex })} style={{
            aspectRatio: '1', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: a.hex, position: 'relative',
            boxShadow: tweaks.accent === a.hex ? `0 0 0 2px ${tweaks.dark ? '#0A0A0B' : '#fff'}, 0 0 0 4px ${a.hex}` : 'none',
            transition: 'all 0.15s',
          }}/>
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: tweaks.dark ? '#71717A' : '#9CA3AF', marginTop: 14, marginBottom: 8 }}>Тема</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ k: false, l: 'Светлая' }, { k: true, l: 'Тёмная' }].map(o => (
          <button key={String(o.k)} onClick={() => update({ dark: o.k })} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tweaks.dark === o.k
              ? tweaks.accent
              : (tweaks.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
            color: tweaks.dark === o.k ? '#fff' : (tweaks.dark ? '#fff' : '#0A0A0B'),
            fontSize: 12, fontWeight: 600, letterSpacing: -0.1,
          }}>{o.l}</button>
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: tweaks.dark ? '#71717A' : '#9CA3AF', marginTop: 14, marginBottom: 8 }}>Функции</div>
      <button onClick={() => update({ aiEnabled: tweaks.aiEnabled === false })} style={{
        width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 6,
        border: 'none', cursor: 'pointer',
        background: tweaks.aiEnabled !== false ? tweaks.accent : (tweaks.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
        color: tweaks.aiEnabled !== false ? '#fff' : (tweaks.dark ? '#fff' : '#0A0A0B'),
        fontSize: 12, fontWeight: 600, textAlign: 'left',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>✨ AI-помощник</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{tweaks.aiEnabled !== false ? 'Вкл' : 'Выкл'}</span>
      </button>
      <button onClick={() => update({ showDualDevice: !tweaks.showDualDevice })} style={{
        width: '100%', padding: '10px 12px', borderRadius: 10,
        border: 'none', cursor: 'pointer',
        background: tweaks.showDualDevice ? tweaks.accent : (tweaks.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
        color: tweaks.showDualDevice ? '#fff' : (tweaks.dark ? '#fff' : '#0A0A0B'),
        fontSize: 12, fontWeight: 600, textAlign: 'left',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Сравнить light/dark</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{tweaks.showDualDevice ? 'Вкл' : 'Выкл'}</span>
      </button>

      <div style={{ fontSize: 10, color: tweaks.dark ? '#71717A' : '#9CA3AF', marginTop: 14, lineHeight: '14px' }}>
        Активный экран: <b style={{ color: tweaks.accent }}>{active}</b>. Используй нижний таб-бар для переключения.
      </div>
    </div>
  );
}

// ── helpers ──
function hexAlpha(hex, a) {
  const { r, g, b } = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function darken(hex, amt) {
  const { r, g, b } = hex2rgb(hex);
  return `rgb(${Math.round(r*(1-amt))},${Math.round(g*(1-amt))},${Math.round(b*(1-amt))})`;
}
function hex2rgb(hex) {
  const n = hex.replace('#', '');
  const f = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  return { r: parseInt(f.slice(0,2),16), g: parseInt(f.slice(2,4),16), b: parseInt(f.slice(4,6),16) };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
