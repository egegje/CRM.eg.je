// Mail screens — Inbox list, Thread view

function MailboxChip({ mb, active, onClick, dark }) {
  const t = theme(dark);
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px 6px 6px', borderRadius: 99, border: 'none', cursor: 'pointer',
      background: active ? t.card : 'transparent',
      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06), 0 0.5px 0 rgba(0,0,0,0.04)' : 'none',
      transition: 'all 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 99,
        background: `linear-gradient(135deg, ${mb.color}, ${mb.color}CC)`,
        color: '#fff', fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{mb.letter}</div>
      <span style={{
        fontSize: 14, fontWeight: active ? 600 : 500,
        color: active ? t.label : t.sec, letterSpacing: -0.2,
      }}>{mb.name}</span>
      {mb.unread > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#fff',
          background: TOKENS.accent, borderRadius: 99,
          padding: '1px 7px', minWidth: 16, textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}>{mb.unread}</span>
      )}
    </button>
  );
}

function MailListRow({ m, onOpen, dark }) {
  const t = theme(dark);
  const { aiEnabled } = React.useContext(window.AppCtx);
  const mb = MAILBOXES.find(x => x.id === m.mailbox);
  return (
    <div onClick={onOpen} style={{
      position: 'relative',
      padding: '14px 20px', cursor: 'pointer',
      background: m.highlighted ? (dark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)') : 'transparent',
      borderBottom: `0.5px solid ${t.sep}`,
    }}>
      {m.unread && (
        <div style={{
          position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
          width: 6, height: 6, borderRadius: 99, background: TOKENS.accent,
        }}/>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${m.avatarColor}, ${m.avatarColor}DD)`,
          color: '#fff', fontSize: 16, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 12px ${m.avatarColor}40`,
        }}>{m.letter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 15, fontWeight: m.unread ? 700 : 500, color: t.label,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: -0.24, flex: 1, minWidth: 0,
            }}>{m.fromName}</span>
            <span style={{ fontSize: 12, color: t.ter, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
          </div>
          <div style={{
            fontSize: 14, fontWeight: m.unread ? 600 : 400, color: m.unread ? t.label : t.sec,
            marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: -0.2,
          }}>{m.subject}</div>
          <div style={{
            fontSize: 13, color: t.ter, marginTop: 3, lineHeight: '18px',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{m.preview}</div>
          {aiEnabled && m.aiSummary && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 10,
              background: dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)',
              display: 'flex', gap: 7, alignItems: 'flex-start',
              border: `0.5px solid ${dark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)'}`,
            }}>
              {L.sparkle(TOKENS.accent, 12)}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>AI • суть</div>
                <div style={{ fontSize: 12, color: t.label, marginTop: 2, lineHeight: '15px' }}>{m.aiSummary}</div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            {mb && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: mb.color,
                background: `${mb.color}18`, padding: '2px 7px', borderRadius: 5,
                letterSpacing: 0.2,
              }}>{mb.name}</span>
            )}
            {m.starred && L.star('#EAB308', 12, '#EAB308')}
            {m.attachment && L.attach(t.ter, 11)}
          </div>
        </div>
      </div>
    </div>
  );
}

function MailScreen({ dark, onOpen }) {
  const t = theme(dark);
  const [active, setActive] = React.useState('metr');
  const total = MAIL_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const unreadTotal = MAILBOXES.reduce((s, m) => s + m.unread, 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>
      {/* Header */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>Почта</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, color: t.label, letterSpacing: -0.8 }}>
              Входящие
              <span style={{ color: t.ter, fontWeight: 600, marginLeft: 8 }}>{unreadTotal}</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              width: 36, height: 36, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{L.search(t.label, 17)}</button>
            <button style={{
              width: 36, height: 36, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentDeep})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 6px 16px ${TOKENS.accentGlow}`,
            }}>{L.edit('#fff', 17)}</button>
          </div>
        </div>
      </div>

      {/* Mailbox chips — horizontal scroll */}
      <div style={{
        display: 'flex', gap: 6, padding: '14px 20px 8px', overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        <style>{`div::-webkit-scrollbar{display:none}`}</style>
        <button onClick={() => setActive('all')} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
          background: active === 'all' ? TOKENS.accent : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
          color: active === 'all' ? '#fff' : t.sec,
          fontSize: 14, fontWeight: 600, flexShrink: 0,
        }}>Все · {total}</button>
        {MAILBOXES.map(mb => (
          <MailboxChip key={mb.id} mb={mb} active={active === mb.id} onClick={() => setActive(mb.id)} dark={dark}/>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 92 }}>
        {MAIL_GROUPS.map(g => (
          <div key={g.title}>
            <div style={{
              padding: '14px 20px 6px',
              fontSize: 11, fontWeight: 700, color: t.ter,
              textTransform: 'uppercase', letterSpacing: 0.8,
            }}>{g.title}</div>
            {g.items.map(m => (
              <MailListRow key={m.id} m={m} dark={dark} onOpen={() => onOpen(m)}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MailThreadScreen({ dark, onBack, msg }) {
  const t = theme(dark);
  const { aiEnabled } = React.useContext(window.AppCtx);
  const m = msg || MAIL_GROUPS[2].items[0]; // the highlighted rosseti one
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <StatusBar tint={dark ? '#fff' : '#000'}/>

      {/* Nav */}
      <div style={{ padding: '4px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', padding: '8px 8px 8px 6px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3, color: TOKENS.accent, fontSize: 17,
        }}>{L.chevronL(TOKENS.accent, 18)}<span style={{ fontWeight: 500 }}>Входящие</span></button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={iconBtn(dark)}>{L.star('#EAB308', 18, '#EAB308')}</button>
          <button style={iconBtn(dark)}>{L.more(t.label, 18)}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 88 }}>
        <div style={{ padding: '8px 20px' }}>
          {/* Subject */}
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 700, color: t.label,
            letterSpacing: -0.4, lineHeight: '28px',
          }}>{m.subject}</h1>

          {/* Sender card */}
          <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `linear-gradient(135deg, ${m.avatarColor}, ${m.avatarColor}DD)`,
              color: '#fff', fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 16px ${m.avatarColor}40`,
            }}>{m.letter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fromName}</div>
              <div style={{ fontSize: 12, color: t.ter, marginTop: 2 }}>кому: pluton.estate.59@mail.ru · 17.04.2026, 08:46</div>
            </div>
          </div>

          {/* AI summary */}
          {aiEnabled && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 16,
            background: dark ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
            border: `0.5px solid ${dark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {L.sparkle(TOKENS.accent, 14)}
              <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>AI · Суть письма</span>
            </div>
            <div style={{ fontSize: 14, color: t.label, marginTop: 6, lineHeight: '20px' }}>
              Россети Урал сообщают о завершении мероприятий по обращению МРСК-П-3117 (восстановление документов о тех.присоединении). Запрашивают оценку работ по 5-балльной шкале.
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={aiChip(dark)}>📎 2 вложения</button>
              <button style={aiChip(dark)}>📋 Создать задачу</button>
              <button style={aiChip(dark)}>↩ Ответить</button>
            </div>
          </div>
          )}

          {/* Body */}
          <div style={{
            marginTop: 20, fontSize: 15, color: t.label,
            lineHeight: '23px', letterSpacing: -0.2,
          }}>
            <p style={{ margin: '0 0 14px' }}>Уважаемый клиент!</p>
            <p style={{ margin: '0 0 14px' }}>Запланированные мероприятия (Восстановление и переоформление документов о технологическом присоединении) по обращению <b style={{ color: TOKENS.accent }}>МРСК-П-3117</b> исполнены.</p>
            <p style={{ margin: '0 0 14px' }}>Обратную связь Вы можете оставить в интернет-приёмной rosseti-ural.ru/client/feedback</p>
            <p style={{ margin: '0 0 14px', color: t.sec, fontSize: 14 }}>С уважением, Россети Урал</p>
            <div style={{ marginTop: 16, fontSize: 12, color: t.ter, lineHeight: '17px', padding: 12, borderLeft: `3px solid ${t.sep}`, background: t.cardEl, borderRadius: '0 8px 8px 0' }}>
              Электричество — неотъемлемая часть жизни современного человека. Не забывайте, что кроме пользы, оно таит в себе потенциальную угрозу…
            </div>
          </div>

          {/* Rating */}
          <div style={{ marginTop: 20, padding: 14, borderRadius: 16, background: t.card, border: `0.5px solid ${t.sep}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.label, marginBottom: 10 }}>Оцените выполненные работы</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Отлично', 'Хорошо', 'Удовл.', 'Плохо', 'Оч. плохо'].map((l, i) => (
                <button key={l} style={{
                  flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: i === 0 ? TOKENS.green + '22' : t.cardEl,
                  color: i === 0 ? TOKENS.green : t.sec,
                  fontSize: 11, fontWeight: 600,
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>2 вложения</div>
            {[
              { name: 'Уведомление приостановление Плутон Эстейт.pdf', size: '112.9 КБ', color: TOKENS.red },
              { name: 'Уведомление_Сажина А.Б.sig', size: '5.3 КБ', color: TOKENS.orange },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8,
                borderRadius: 12, background: t.card, border: `0.5px solid ${t.sep}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${f.color}18`, color: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
                }}>{f.name.split('.').pop().toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: t.ter, marginTop: 1 }}>{f.size}</div>
                </div>
                {L.chevronR(t.ter, 14)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }}>
        <Glass dark={dark} radius={0} style={{ padding: '10px 20px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {[{i:L.reply, l:'Ответить'},{i:L.forward, l:'Переслать'},{i:L.trash, l:'Удалить'},{i:L.more, l:'Ещё'}].map((b, i) => (
              <button key={i} style={{
                background: 'none', border: 'none', padding: 6, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                color: TOKENS.accent,
              }}>{b.i(TOKENS.accent, 22)}<span style={{ fontSize: 10, fontWeight: 500 }}>{b.l}</span></button>
            ))}
          </div>
        </Glass>
      </div>
    </div>
  );
}

const iconBtn = (dark) => ({
  width: 36, height: 36, borderRadius: 99, border: 'none', cursor: 'pointer',
  background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const aiChip = (dark) => ({
  padding: '6px 10px', borderRadius: 99, border: 'none', cursor: 'pointer',
  background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
  color: TOKENS.accentDeep, fontSize: 12, fontWeight: 600,
});

Object.assign(window, { MailScreen, MailThreadScreen, iconBtn });
