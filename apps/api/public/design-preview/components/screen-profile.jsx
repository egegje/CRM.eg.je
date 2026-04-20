// Profile screen + bottom tab bar

function CustomTabBar({ active, onChange, dark }) {
  const t = theme(dark);
  const tabs = [
    { key: 'dashboard', icon: L.grid, label: 'Главная' },
    { key: 'mail', icon: L.inbox, label: 'Почта' },
    { key: 'tasks', icon: L.kanban, label: 'Задачи' },
    { key: 'finance', icon: L.wallet, label: 'Финансы' },
    { key: 'profile', icon: L.user, label: 'Профиль' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 14, left: 10, right: 10, zIndex: 40,
      borderRadius: 28, height: 66, overflow: 'hidden',
      boxShadow: dark
        ? '0 10px 30px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.3)'
        : '0 10px 30px rgba(0,0,0,0.1), 0 2px 10px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        background: dark ? 'rgba(22,22,25,0.78)' : 'rgba(255,255,255,0.78)',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 28,
        border: dark ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.05)',
        boxShadow: dark
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.1)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.9)',
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative', display: 'flex', height: '100%', padding: '0 4px', alignItems: 'center' }}>
        {tabs.map(tab => {
          const on = active === tab.key;
          const color = on ? TOKENS.accent : t.ter;
          return (
            <button key={tab.key} onClick={() => onChange(tab.key)} style={{
              flex: 1, height: 54, border: 'none', background: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, cursor: 'pointer',
              position: 'relative',
            }}>
              <div style={{ position: 'relative' }}>
                {on && (
                  <div style={{
                    position: 'absolute', inset: -6,
                    background: `radial-gradient(circle, ${TOKENS.accentGlow}, transparent 70%)`,
                    borderRadius: 99,
                  }}/>
                )}
                <div style={{ position: 'relative' }}>{tab.icon(color, 22)}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: on ? 700 : 500,
                color, letterSpacing: -0.1,
                fontFamily: '-apple-system, system-ui',
              }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileScreen({ dark }) {
  const t = theme(dark);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: t.label, letterSpacing: -0.8 }}>Профиль</h1>
        <button style={iconBtn(dark)}>{L.settings(t.label, 18)}</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 100px' }}>
        {/* Profile card */}
        <div style={{
          padding: 20, borderRadius: 22, textAlign: 'center',
          background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.violet})`,
          color: '#fff', position: 'relative', overflow: 'hidden',
          boxShadow: `0 20px 40px ${TOKENS.accentGlow}`,
        }}>
          <div style={{
            position: 'absolute', right: -30, top: -30, width: 140, height: 140,
            borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
          }}/>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto',
            background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, position: 'relative',
          }}>ГН</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12, letterSpacing: -0.4, position: 'relative' }}>Гнатюк А.В.</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2, position: 'relative' }}>ИП · Администратор · 6 компаний</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, position: 'relative' }}>
            <div style={{
              padding: '6px 12px', borderRadius: 99,
              background: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 600,
            }}>PRO</div>
            <div style={{
              padding: '6px 12px', borderRadius: 99,
              background: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 600,
            }}>14 проектов</div>
          </div>
        </div>

        {/* Company switcher */}
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, paddingLeft: 4 }}>
          Компании
        </div>
        <div style={{ borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}`, overflow: 'hidden' }}>
          {[
            { name: 'Плутон Эстейт', role: 'Директор', color: '#A855F7', active: true },
            { name: 'МЕТР Девелопмент', role: 'Учредитель', color: '#6366F1', active: false },
            { name: 'ИП Гнатюк', role: 'ИП', color: '#10B981', active: false },
          ].map((c, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderBottom: i < arr.length - 1 ? `0.5px solid ${t.sep}` : 'none',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${c.color}, ${c.color}DD)`,
                color: '#fff', fontSize: 14, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{c.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>{c.name}</div>
                <div style={{ fontSize: 11, color: t.ter, marginTop: 1 }}>{c.role}</div>
              </div>
              {c.active && (
                <div style={{
                  width: 22, height: 22, borderRadius: 99,
                  background: TOKENS.green,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Menu */}
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, paddingLeft: 4 }}>
          Настройки
        </div>
        <div style={{ borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}`, overflow: 'hidden' }}>
          {[
            { label: 'Уведомления', icon: L.bell, color: TOKENS.red, value: 'Все' },
            { label: 'Интеграции', icon: L.refresh, color: TOKENS.blue, value: '4 активны' },
            { label: 'Команда', icon: L.user, color: TOKENS.orange, value: '8 чел.' },
            { label: 'Шаблоны документов', icon: L.doc, color: TOKENS.green, value: null },
            { label: 'AI-помощник', icon: L.sparkle, color: TOKENS.violet, value: 'Pro' },
          ].map((m, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderBottom: i < arr.length - 1 ? `0.5px solid ${t.sep}` : 'none',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: `${m.color}18`, color: m.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{m.icon(m.color, 16)}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.label }}>{m.label}</div>
              {m.value && <span style={{ fontSize: 12, color: t.ter }}>{m.value}</span>}
              {L.chevronR(t.ter, 14)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CustomTabBar, ProfileScreen });
