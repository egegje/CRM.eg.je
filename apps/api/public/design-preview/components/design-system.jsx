// design-system.jsx — Tokens, primitives, and СМР-specific components

const DS = {
  // Accents (from repo AccentColor: 0.145, 0.388, 0.922)
  accent: '#2563EB',
  accentSoft: '#E8EFFE',
  accentDark: '#1D4FD4',
  orange: '#FF9500',
  orangeSoft: '#FFF1E0',
  orangeDark: '#D97A00',
  // iOS system
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  yellow: '#FFCC00',
  purple: '#AF52DE',
  gray1: '#8E8E93',
  gray2: '#AEAEB2',
  gray3: '#C7C7CC',
  gray4: '#D1D1D6',
  gray5: '#E5E5EA',
  gray6: '#F2F2F7',
  // Text
  label: '#000',
  sec: 'rgba(60,60,67,0.6)',
  ter: 'rgba(60,60,67,0.3)',
  quart: 'rgba(60,60,67,0.18)',
  sep: 'rgba(60,60,67,0.12)',
  // Dark
  d_bg: '#000',
  d_card: '#1C1C1E',
  d_card2: '#2C2C2E',
  d_label: '#fff',
  d_sec: 'rgba(235,235,245,0.6)',
  d_ter: 'rgba(235,235,245,0.3)',
  d_sep: 'rgba(84,84,88,0.35)',
};

// Theme helper
function useTheme(dark) {
  return {
    bg: dark ? '#000' : '#F2F2F7',
    card: dark ? DS.d_card : '#fff',
    card2: dark ? DS.d_card2 : '#F2F2F7',
    label: dark ? DS.d_label : DS.label,
    sec: dark ? DS.d_sec : DS.sec,
    ter: dark ? DS.d_ter : DS.ter,
    sep: dark ? DS.d_sep : DS.sep,
    accent: DS.accent,
  };
}

// ───────── Status pills (СМР) ─────────
function StatusPill({ status, accent = DS.accent }) {
  const map = {
    open: { bg: `${DS.blue}1F`, fg: DS.blue, label: 'открыта' },
    in_progress: { bg: `${DS.orange}22`, fg: DS.orangeDark, label: 'в работе' },
    done: { bg: `${DS.green}1F`, fg: DS.green, label: 'выполнена' },
    cancelled: { bg: `${DS.gray1}22`, fg: DS.gray1, label: 'отменена' },
    overdue: { bg: `${DS.red}1F`, fg: DS.red, label: 'просрочка' },
  };
  const s = map[status] || map.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 9px', borderRadius: 8, background: s.bg, color: s.fg,
      fontSize: 12, fontWeight: 600, letterSpacing: -0.08,
      fontFamily: '-apple-system, system-ui',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.fg, opacity: 0.9 }}/>
      {s.label}
    </span>
  );
}

// ───────── Progress bar ─────────
function ProgressBar({ value, accent = DS.accent, dark = false, height = 6, showLabel = false }) {
  const trackBg = dark ? 'rgba(255,255,255,0.1)' : 'rgba(60,60,67,0.12)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <div style={{ flex: 1, height, borderRadius: 99, background: trackBg, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%', borderRadius: 99,
          background: `linear-gradient(90deg, ${accent}, ${accent}DD)`,
          transition: 'width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}/>
      </div>
      {showLabel && (
        <span style={{
          fontSize: 13, fontWeight: 600, color: dark ? '#fff' : '#000',
          fontFamily: '-apple-system, system-ui', fontVariantNumeric: 'tabular-nums',
          minWidth: 32, textAlign: 'right',
        }}>{Math.round(value)}%</span>
      )}
    </div>
  );
}

// ───────── Avatar stack ─────────
function AvatarStack({ people, size = 24, max = 3 }) {
  const shown = people.slice(0, max);
  const rest = people.length - max;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <div key={i} style={{
          width: size, height: size, borderRadius: 99,
          background: p.color || '#ccc', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.42, fontWeight: 600,
          fontFamily: '-apple-system, system-ui',
          border: '2px solid #fff',
          marginLeft: i === 0 ? 0 : -size * 0.35,
          boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)',
          position: 'relative', zIndex: 10 - i,
        }}>{p.initials}</div>
      ))}
      {rest > 0 && (
        <div style={{
          width: size, height: size, borderRadius: 99,
          background: '#E5E5EA', color: '#636366',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.36, fontWeight: 600,
          border: '2px solid #fff', marginLeft: -size * 0.35,
          fontFamily: '-apple-system, system-ui',
        }}>+{rest}</div>
      )}
    </div>
  );
}

// ───────── Ring progress ─────────
function RingProgress({ value, size = 48, stroke = 5, accent = DS.accent, dark = false, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  const trackColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(60,60,67,0.12)';
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={accent} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}/>
      </svg>
      {children && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.28, fontWeight: 700,
          color: dark ? '#fff' : '#000', fontFamily: '-apple-system, system-ui',
          fontVariantNumeric: 'tabular-nums',
        }}>{children}</div>
      )}
    </div>
  );
}

// ───────── Card (grouped) ─────────
function Card({ children, dark = false, style = {}, pad = 16, onClick }) {
  const bg = dark ? DS.d_card : '#fff';
  return (
    <div onClick={onClick} style={{
      background: bg, borderRadius: 18, padding: pad,
      boxShadow: dark ? 'none' : '0 0.5px 0 rgba(0,0,0,0.04)',
      cursor: onClick ? 'pointer' : undefined,
      transition: 'transform 0.15s, opacity 0.15s',
      ...style,
    }} onPointerDown={e => onClick && (e.currentTarget.style.opacity = '0.7')}
       onPointerUp={e => onClick && (e.currentTarget.style.opacity = '1')}
       onPointerLeave={e => onClick && (e.currentTarget.style.opacity = '1')}>
      {children}
    </div>
  );
}

// ───────── Tab bar (bottom) — liquid glass ─────────
function TabBar({ tabs, active, onChange, dark = false, accent = DS.accent }) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 12, right: 12, zIndex: 40,
      borderRadius: 28, overflow: 'hidden', height: 58,
      boxShadow: dark
        ? '0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)'
        : '0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        background: dark ? 'rgba(40,40,45,0.72)' : 'rgba(255,255,255,0.72)',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 28,
        boxShadow: dark
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.12)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.7)',
        border: dark ? '0.5px solid rgba(255,255,255,0.1)' : '0.5px solid rgba(0,0,0,0.05)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'relative', display: 'flex', height: '100%',
        alignItems: 'center', padding: '0 6px',
      }}>
        {tabs.map((t, i) => {
          const on = active === i;
          const color = on ? accent : (dark ? 'rgba(235,235,245,0.6)' : '#8E8E93');
          return (
            <button key={i} onClick={() => onChange(i)} style={{
              flex: 1, height: 46, border: 'none', background: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, cursor: 'pointer', padding: 0,
              color, fontFamily: '-apple-system, system-ui',
            }}>
              {t.icon(color)}
              <span style={{
                fontSize: 10, fontWeight: 500, letterSpacing: -0.08, marginTop: 2,
              }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────── Icons ─────────
const Icons = {
  dashboard: (c) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="10" rx="2" stroke={c} strokeWidth="1.8"/>
      <rect x="3" y="15" width="8" height="6" rx="2" stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="3" width="8" height="6" rx="2" stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="11" width="8" height="10" rx="2" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  building: (c) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 21V7l7-3 7 3v14" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M4 21h16" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="8" y="10" width="2.5" height="3" fill={c}/>
      <rect x="12.5" y="10" width="2.5" height="3" fill={c}/>
      <rect x="8" y="15" width="2.5" height="3" fill={c}/>
      <rect x="12.5" y="15" width="2.5" height="3" fill={c}/>
      <path d="M18 21V11l3 1v9" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  tasks: (c) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="3" stroke={c} strokeWidth="1.8"/>
      <path d="M7 9h10M7 13h7M7 17h4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  people: (c) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.5" stroke={c} strokeWidth="1.8"/>
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="17" cy="9" r="2.5" stroke={c} strokeWidth="1.8"/>
      <path d="M15 20c0-2.8 1.8-5 4-5s4 2.2 4 5" stroke={c} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
    </svg>
  ),
  profile: (c) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.8"/>
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  search: (c) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={c} strokeWidth="2"/>
      <path d="M20 20l-3.5-3.5" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  plus: (c) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  ),
  filter: (c) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M7 12h10M10 18h4" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  chevron: (c) => (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
      <path d="M1 1l6 6-6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  chevronBack: (c) => (
    <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
      <path d="M10 2L2 10l8 8" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dots: (c) => (
    <svg width="22" height="6" viewBox="0 0 22 6">
      <circle cx="3" cy="3" r="2.5" fill={c}/>
      <circle cx="11" cy="3" r="2.5" fill={c}/>
      <circle cx="19" cy="3" r="2.5" fill={c}/>
    </svg>
  ),
  camera: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke={c} strokeWidth="1.8"/>
      <circle cx="12" cy="13" r="4" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  doc: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" stroke={c} strokeWidth="1.8"/>
      <path d="M14 3v5h5" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  calendar: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={c} strokeWidth="1.8"/>
      <path d="M3 10h18M8 3v4M16 3v4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  chat: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.3 0-2.5-.3-3.6-.8L4 20l1-3.5C4.4 15.2 4 13.6 4 12z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  map: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 21c-4-5-7-8.5-7-12a7 7 0 0114 0c0 3.5-3 7-7 12z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="12" cy="9" r="2.5" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  check: (c) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7l3.5 3.5L12 3.5" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  trending: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  bell: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M10 19a2 2 0 004 0" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  phone: (c) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1A19.5 19.5 0 015 12.1a19.8 19.8 0 01-3.1-8.7A2 2 0 013.9 1.2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.5 2.1L8.1 9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.8.5 2.7.6a2 2 0 011.7 2z"
        stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  hard_hat: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 17h18v2H3zM5 17c0-4 3-7 7-7s7 3 7 7" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M10 10V6h4v4" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  money: (c) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke={c} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
};

Object.assign(window, { DS, useTheme, StatusPill, ProgressBar, AvatarStack, RingProgress, Card, TabBar, Icons });
