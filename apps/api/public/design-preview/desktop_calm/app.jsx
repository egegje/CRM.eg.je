// Desktop app shell — window chrome + routing + keyboard + tweaks

const DeskCtx = React.createContext({ accent: '#0F6CBD' });
window.DeskCtx = DeskCtx;

function DesktopApp() {
  const TWEAKS = /*EDITMODE-BEGIN*/{
    "accent": "blue",
    "dark": false,
    "aiEnabled": true,
    "density": "cozy",
    "fontScale": 1,
    "listLayout": "comfortable"
  }/*EDITMODE-END*/;

  const [tweaks, setTweaks] = React.useState(() => {
    try { return { ...TWEAKS, ...JSON.parse(localStorage.getItem('crm-desk-calm-tweaks') || '{}') }; }
    catch { return TWEAKS; }
  });
  const [tweaksOpen, setTweaksOpen] = React.useState(false);

  const updateTweaks = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaks(next);
    localStorage.setItem('crm-desk-calm-tweaks', JSON.stringify(next));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };

  const [section, setSection] = React.useState(() => localStorage.getItem('crm-desk-calm-section') || 'home');
  const [mailboxFilter, setMailboxFilter] = React.useState(null);
  const [cmdOpen, setCmdOpen] = React.useState(false);

  const dark = tweaks.dark;
  const accentName = ACCENTS[tweaks.accent] ? tweaks.accent : 'blue';
  React.useEffect(() => { applyAccent(accentName); }, [accentName]);
  applyAccent(accentName);
  const accent = ACCENTS[accentName].base;
  const aiEnabled = tweaks.aiEnabled !== false;
  const density = DENSITY[tweaks.density] || DENSITY.cozy;
  const fontScale = tweaks.fontScale || 1;
  const listLayout = tweaks.listLayout || 'comfortable';
  const t = dtheme(dark);

  React.useEffect(() => { localStorage.setItem('crm-desk-calm-section', section); }, [section]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      // ⌘K / Ctrl+K always
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdOpen(o => !o); return;
      }
      if (isInput) return;
      // g then i/m/t/f  (like Superhuman)
      if (e.key === '1') setSection('home');
      if (e.key === '2') setSection('mail');
      if (e.key === '3') setSection('tasks');
      if (e.key === '4') setSection('finance');
      if (e.key === 'd' && e.shiftKey) updateTweaks({ dark: !dark });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dark]);

  // Edit mode contract
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const onNav = (s) => {
    if (s !== 'mail') setMailboxFilter(null);
    setSection(s);
  };

  const screen = () => {
    switch (section) {
      case 'home': return <DesktopHome dark={dark} aiEnabled={aiEnabled} onNav={onNav}/>;
      case 'mail': return <DesktopMail dark={dark} aiEnabled={aiEnabled} mailboxFilter={mailboxFilter}/>;
      case 'tasks': return <DesktopTasks dark={dark} aiEnabled={aiEnabled}/>;
      case 'finance': return <DesktopFinance dark={dark} aiEnabled={aiEnabled}/>;
      case 'properties': return <DesktopProperties dark={dark}/>;
      case 'contacts': return <DesktopContacts dark={dark}/>;
      case 'docs': return <DesktopDocs dark={dark}/>;
      case 'analytics': return <DesktopAnalytics dark={dark}/>;
      default: return <DesktopHome dark={dark} aiEnabled={aiEnabled} onNav={onNav}/>;
    }
  };

  return (
    <DeskCtx.Provider value={{ accent, dark, density, fontScale, listLayout, aiEnabled, t }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; font-size: ${14 * fontScale}px; }
        kbd { font-family: inherit; }
        ::-webkit-scrollbar { width: 12px; height: 12px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'}; border-radius: 6px; border: 3px solid transparent; background-clip: content-box; }
        ::-webkit-scrollbar-thumb:hover { background: ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)'}; background-clip: content-box; border: 3px solid transparent; }
      `}</style>

      <div style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: dark ? '#050507' : '#E4E4E7',
        padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Window chrome */}
        <div data-screen-label="Desktop" style={{
          width: '100%', height: '100%', maxWidth: 1680, maxHeight: 1000,
          borderRadius: 12, overflow: 'hidden',
          background: t.bg,
          boxShadow: dark
            ? '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.6)'
            : '0 0 0 1px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Title bar */}
          <div style={{
            height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 14px', background: t.bgSidebar,
            borderBottom: `1px solid ${t.sep}`,
          }}>
            <div style={{ display: 'flex', gap: 7 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }}/>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }}/>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }}/>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: t.sec, letterSpacing: -0.1 }}>
              Плутон CRM · {({ home: 'Главная', mail: 'Входящие', tasks: 'Задачи', finance: 'Финансы', properties: 'Объекты', contacts: 'Контрагенты', docs: 'Документы', analytics: 'Аналитика' })[section]}
            </div>
            <div style={{ width: 52, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ color: t.ter, display: 'flex', cursor: 'pointer' }} onClick={() => setCmdOpen(true)}>{I.search(14)}</span>
              <span style={{ color: t.ter, display: 'flex', cursor: 'pointer' }}>{I.bell(14)}</span>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <DesktopSidebar dark={dark} section={section} setSection={onNav}
              mailboxFilter={mailboxFilter} setMailboxFilter={setMailboxFilter}/>
            {screen()}
          </div>
        </div>

        <CmdPalette open={cmdOpen} onClose={() => setCmdOpen(false)}
          onNav={onNav} dark={dark} setDark={v => updateTweaks({ dark: v })}
          setMailboxFilter={setMailboxFilter}/>

        {tweaksOpen && <TweaksPanel tweaks={tweaks} update={updateTweaks} dark={dark}/>}
      </div>
    </DeskCtx.Provider>
  );
}

function TweaksPanel({ tweaks, update, dark }) {
  const t = dtheme(dark);
  const accentList = [
    { key: 'blue',  label: 'Синий',   c: ACCENTS.blue.base },
    { key: 'slate', label: 'Графит',  c: ACCENTS.slate.base },
    { key: 'green', label: 'Зелёный', c: ACCENTS.green.base },
    { key: 'teal',  label: 'Бирюза',  c: ACCENTS.teal.base },
    { key: 'plum',  label: 'Слива',   c: ACCENTS.plum.base },
  ];
  const densities = [
    { key: 'comfortable', label: 'Комфортная' },
    { key: 'cozy',        label: 'Средняя' },
    { key: 'compact',     label: 'Плотная' },
  ];
  const layouts = [
    { key: 'comfortable', label: '2 строки' },
    { key: 'compact',     label: '1 строка' },
  ];
  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, width: 296, zIndex: 200,
      background: dark ? DT.d_bgPane : DT.bgPane, borderRadius: 8,
      border: `1px solid ${t.sepStrong}`,
      boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
      padding: 16, fontSize: 13,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.label, marginBottom: 14, letterSpacing: -0.1 }}>Tweaks</div>

      <SectionLabel t={t}>Акцент</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {accentList.map(a => (
          <div key={a.key} onClick={() => update({ accent: a.key })} title={a.label} style={{
            width: 26, height: 26, borderRadius: 4, background: a.c, cursor: 'pointer',
            outline: tweaks.accent === a.key ? `2px solid ${t.label}` : 'none',
            outlineOffset: 2,
          }}/>
        ))}
      </div>

      <SectionLabel t={t}>Тема</SectionLabel>
      <Segmented t={t} dark={dark} value={tweaks.dark ? 'dark' : 'light'} onChange={v => update({ dark: v === 'dark' })}
        options={[{ key: 'light', label: 'Светлая' }, { key: 'dark', label: 'Тёмная' }]}/>

      <div style={{ height: 10 }}/>
      <SectionLabel t={t}>Плотность</SectionLabel>
      <Segmented t={t} dark={dark} value={tweaks.density || 'cozy'} onChange={v => update({ density: v })}
        options={densities}/>

      <div style={{ height: 10 }}/>
      <SectionLabel t={t}>Компоновка списков</SectionLabel>
      <Segmented t={t} dark={dark} value={tweaks.listLayout || 'comfortable'} onChange={v => update({ listLayout: v })}
        options={layouts}/>

      <div style={{ height: 12 }}/>
      <SectionLabel t={t}>Размер шрифта · {Math.round((tweaks.fontScale || 1) * 100)}%</SectionLabel>
      <input type="range" min="0.88" max="1.15" step="0.01" value={tweaks.fontScale || 1}
        onChange={e => update({ fontScale: parseFloat(e.target.value) })}
        style={{ width: '100%', accentColor: DT.accent }}/>

      <div style={{ height: 6, borderBottom: `1px solid ${t.sep}`, margin: '10px 0 10px' }}/>
      <Row label="AI-подсказки" t={t}>
        <Toggle on={tweaks.aiEnabled !== false} onClick={() => update({ aiEnabled: !(tweaks.aiEnabled !== false) })} accent={DT.accent}/>
      </Row>

      <div style={{ padding: '10px 0 0', marginTop: 4, borderTop: `1px solid ${t.sep}`, fontSize: 11, color: t.ter, lineHeight: '16px' }}>
        <kbd style={kbdStyle(t, dark)}>⌘K</kbd> палитра  ·  <kbd style={kbdStyle(t, dark)}>1–4</kbd> разделы  ·  <kbd style={kbdStyle(t, dark)}>⇧D</kbd> тема
      </div>
    </div>
  );
}

function SectionLabel({ t, children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.ter, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{children}</div>;
}

function Segmented({ options, value, onChange, t, dark }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      borderRadius: 6, padding: 2, gap: 2,
    }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <div key={o.key} onClick={() => onChange(o.key)} style={{
            padding: '5px 8px', fontSize: 12, textAlign: 'center', cursor: 'pointer',
            background: on ? (dark ? DT.d_bgPane : DT.bgPane) : 'transparent',
            color: on ? t.label : t.sec, borderRadius: 4,
            boxShadow: on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            fontWeight: on ? 600 : 500,
          }}>{o.label}</div>
        );
      })}
    </div>
  );
}

function Row({ label, t, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: t.label }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, accent }) {
  return (
    <div onClick={onClick} style={{
      width: 32, height: 18, borderRadius: 9, padding: 2, cursor: 'pointer',
      background: on ? accent : '#D4D4D8', transition: 'background 0.15s',
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transform: on ? 'translateX(14px)' : 'translateX(0)', transition: 'transform 0.15s',
      }}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DesktopApp/>);
