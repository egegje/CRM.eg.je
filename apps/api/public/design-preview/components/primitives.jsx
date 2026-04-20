// Premium iOS 26 primitives — custom, not the starter defaults

// ─────────── Status bar (dark-aware, always white text on dark/colored bg) ───────────
function StatusBar({ tint = '#000', time = '9:41' }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '18px 30px 0', alignItems: 'center', height: 54, boxSizing: 'border-box',
      position: 'relative', zIndex: 20,
    }}>
      <span style={{
        fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 600,
        fontSize: 17, color: tint, letterSpacing: -0.4, paddingLeft: 4,
      }}>{time}</span>
      <div style={{ width: 130, height: 37 }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
          <rect x="0" y="7" width="3" height="4" rx="0.5" fill={tint}/>
          <rect x="4.5" y="5" width="3" height="6" rx="0.5" fill={tint}/>
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" fill={tint}/>
          <rect x="13.5" y="0" width="3" height="11" rx="0.5" fill={tint}/>
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M8 3C10.2 3 12.2 3.8 13.7 5.2L14.8 4.1C13 2.4 10.6 1.3 8 1.3C5.4 1.3 3 2.4 1.2 4.1L2.3 5.2C3.8 3.8 5.8 3 8 3Z" fill={tint}/>
          <path d="M8 6.4C9.3 6.4 10.5 6.9 11.4 7.7L12.5 6.6C11.2 5.5 9.7 4.8 8 4.8C6.3 4.8 4.8 5.5 3.5 6.6L4.6 7.7C5.5 6.9 6.7 6.4 8 6.4Z" fill={tint}/>
          <circle cx="8" cy="9.8" r="1.4" fill={tint}/>
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke={tint} strokeOpacity="0.4" fill="none"/>
          <rect x="2" y="2" width="19" height="8" rx="1.5" fill={tint}/>
          <path d="M24 4V8C24.7 7.7 25.2 7 25.2 6C25.2 5 24.7 4.3 24 4Z" fill={tint} fillOpacity="0.5"/>
        </svg>
      </div>
    </div>
  );
}

// ─────────── Dynamic island ───────────
function DynamicIsland() {
  return (
    <div style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
      width: 124, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      pointerEvents: 'none',
    }}/>
  );
}

// ─────────── Home indicator ───────────
function HomeBar({ dark }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
      paddingBottom: 8, pointerEvents: 'none', zIndex: 60,
    }}>
      <div style={{
        width: 134, height: 5, borderRadius: 99,
        background: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)',
      }}/>
    </div>
  );
}

// ─────────── Device shell ───────────
function Device({ children, dark, width = 390, height = 844, bg }) {
  return (
    <div style={{
      width, height, borderRadius: 52, overflow: 'hidden', position: 'relative',
      background: bg || (dark ? TOKENS.d_bg : TOKENS.bg),
      boxShadow: '0 40px 100px rgba(0,0,0,0.25), 0 0 0 10px #1C1C1E, 0 0 0 11px #2C2C2E',
      fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      isolation: 'isolate',
    }}>
      <DynamicIsland/>
      {children}
      <HomeBar dark={dark}/>
    </div>
  );
}

// ─────────── Glass panel (blurred backdrop, frosted) ───────────
function Glass({ children, dark, style = {}, radius = 24 }) {
  return (
    <div style={{
      position: 'relative', borderRadius: radius, overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        background: dark ? 'rgba(22,22,25,0.72)' : 'rgba(255,255,255,0.72)',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        border: dark ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.05)',
        boxShadow: dark
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.1)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.9)',
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─────────── Icon set — lucide-style, stroke 1.8, consistent ───────────
const L = {
  inbox: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M22 12H16L14 15H10L8 12H2M5.5 5H18.5L22 12V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V12L5.5 5Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  send: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  edit: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M11 4H4C3.4 4 3 4.4 3 5V20C3 20.6 3.4 21 4 21H19C19.6 21 20 20.6 20 20V13M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  star: (c, s = 14, fill) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill || 'none'}>
      <path d="M12 2L15 9L22 10L17 15L18 22L12 18.5L6 22L7 15L2 10L9 9L12 2Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  trash: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 6H21M8 6V4C8 2.9 8.9 2 10 2H14C15.1 2 16 2.9 16 4V6M5 6V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  check: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={c} strokeWidth="1.8"/>
      <path d="M7.5 12L10.5 15L16.5 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  clock: (c, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={c} strokeWidth="1.8"/>
      <path d="M12 7V12L15 14" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  search: (c, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={c} strokeWidth="1.8"/>
      <path d="M21 21L16 16" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  plus: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 5V19M5 12H19" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  ),
  chevronR: (c, s = 14) => (
    <svg width={s * 0.57} height={s} viewBox="0 0 8 14" fill="none">
      <path d="M1 1L7 7L1 13" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  chevronL: (c, s = 20) => (
    <svg width={s * 0.6} height={s} viewBox="0 0 12 20" fill="none">
      <path d="M10 2L2 10L10 18" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  attach: (c, s = 12) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M21 11L13 19C10.8 21.2 7.2 21.2 5 19C2.8 16.8 2.8 13.2 5 11L14 2C15.5 0.5 17.9 0.5 19.5 2C21 3.5 21 5.9 19.5 7.5L10.5 16.5C9.7 17.3 8.3 17.3 7.5 16.5C6.7 15.7 6.7 14.3 7.5 13.5L15 6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  sparkle: (c, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <path d="M12 2L14 9L21 11L14 13L12 20L10 13L3 11L10 9Z"/>
    </svg>
  ),
  flame: (c, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <path d="M12 2C12 6 16 6 16 11C16 13 15 15 12 15C9 15 8 13 8 11C8 9 9 8 9 7C7 8 5 10 5 14C5 18 8 22 12 22C16 22 19 19 19 14C19 8 12 7 12 2Z"/>
    </svg>
  ),
  filter: (c, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 6H21M7 12H17M10 18H14" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  grid: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={c} strokeWidth="1.8"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  list: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  kanban: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="5" height="16" rx="1.5" stroke={c} strokeWidth="1.8"/>
      <rect x="10" y="4" width="5" height="10" rx="1.5" stroke={c} strokeWidth="1.8"/>
      <rect x="17" y="4" width="4" height="13" rx="1.5" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  chart: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 3V21H21M7 14L11 10L14 13L21 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  wallet: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="14" rx="3" stroke={c} strokeWidth="1.8"/>
      <path d="M2 10H22" stroke={c} strokeWidth="1.8"/>
      <circle cx="17" cy="15" r="1.5" fill={c}/>
    </svg>
  ),
  user: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.8"/>
      <path d="M4 21C4 16.6 7.6 13 12 13S20 16.6 20 21" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  arrowUp: (c, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M7 17L17 7M17 7H9M17 7V15" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  arrowDown: (c, s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M17 7L7 17M7 17H15M7 17V9" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  refresh: (c, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 12A9 9 0 0118 6L21 9M21 3V9H15M21 12A9 9 0 016 18L3 15M3 21V15H9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  settings: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8"/>
      <path d="M19.4 15A1.65 1.65 0 0019.7 16.9L19.8 17A2 2 0 1117 19.8L16.9 19.7A1.65 1.65 0 0015 19.4A1.65 1.65 0 0014 20.9V21A2 2 0 1110 21V20.9A1.65 1.65 0 009 19.4A1.65 1.65 0 007.1 19.7L7 19.8A2 2 0 114.2 17L4.3 16.9A1.65 1.65 0 004.6 15A1.65 1.65 0 003.1 14H3A2 2 0 013 10H3.1A1.65 1.65 0 004.6 9A1.65 1.65 0 004.3 7.1L4.2 7A2 2 0 117 4.2L7.1 4.3A1.65 1.65 0 009 4.6A1.65 1.65 0 0010 3.1V3A2 2 0 0114 3V3.1A1.65 1.65 0 0015 4.6A1.65 1.65 0 0016.9 4.3L17 4.2A2 2 0 1119.8 7L19.7 7.1A1.65 1.65 0 0019.4 9A1.65 1.65 0 0020.9 10H21A2 2 0 0121 14H20.9A1.65 1.65 0 0019.4 15Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  bell: (c, s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 8A6 6 0 0118 8C18 15 21 17 21 17H3S6 15 6 8M13.7 21C13.5 21.3 13.3 21.6 12.9 21.8A2 2 0 0110 20" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  reply: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M9 17L4 12L9 7M4 12H15A5 5 0 0120 17V20" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  forward: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M15 17L20 12L15 7M20 12H9A5 5 0 004 17V20" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  more: (c, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="1.5" fill={c}/>
      <circle cx="19" cy="12" r="1.5" fill={c}/>
      <circle cx="5" cy="12" r="1.5" fill={c}/>
    </svg>
  ),
  doc: (c, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6A2 2 0 004 4V20A2 2 0 006 22H18A2 2 0 0020 20V8L14 2Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M14 2V8H20" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  folder: (c, s = 12) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M3 7A2 2 0 015 5H9L11 7H19A2 2 0 0121 9V18A2 2 0 0119 20H5A2 2 0 013 18V7Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  cal: (c, s = 12) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={c} strokeWidth="1.8"/>
      <path d="M3 10H21M8 2V6M16 2V6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  tag: (c, s = 12) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M20 13L13 20A2 2 0 0110 20L4 14A2 2 0 014 11L11 4L20 4V13Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="16" cy="8" r="1.2" fill={c}/>
    </svg>
  ),
  comment: (c, s = 12) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M21 11C21 16 17 20 12 20C10.7 20 9.4 19.7 8.3 19.2L3 21L4.8 16C4.3 14.8 4 13.4 4 12C4 7 8 3 13 3C17 3 21 7 21 11Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
};

Object.assign(window, { StatusBar, DynamicIsland, HomeBar, Device, Glass, L });
