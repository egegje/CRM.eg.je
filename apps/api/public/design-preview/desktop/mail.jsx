// Desktop Mail — 2 panes: message list + thread reader

function priorityColor(p) {
  return { urgent: DT.red, high: DT.orange, normal: DT.blue, low: DT.ter }[p] || DT.ter;
}

function MailListItem({ m, selected, onClick, dark, t, accent }) {
  const [hover, setHover] = React.useState(false);
  const mb = MAILBOXES.find(x => x.id === m.mailbox);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 16px 10px 14px',
        borderBottom: `1px solid ${t.sep}`,
        cursor: 'pointer',
        background: selected ? (dark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)') : (hover ? t.bgHover : 'transparent'),
        borderLeft: `2px solid ${selected ? accent : 'transparent'}`,
        position: 'relative',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {m.unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }}/>}
        {!m.unread && <div style={{ width: 6, height: 6, flexShrink: 0 }}/>}
        <div style={{
          fontSize: 13, fontWeight: m.unread ? 700 : 500, color: t.label,
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: -0.1,
        }}>{m.fromName}</div>
        {m.starred && <span style={{ color: DT.gold, display: 'flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>}
        <span style={{ fontSize: 11, color: t.ter, flexShrink: 0 }}>{m.time}</span>
      </div>
      <div style={{
        fontSize: 12.5, fontWeight: m.unread ? 600 : 500, color: m.unread ? t.label : t.sec,
        marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        paddingLeft: 14,
      }}>{m.subject}</div>
      <div style={{
        fontSize: 12, color: t.ter, lineHeight: '16px',
        paddingLeft: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{m.preview}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 14 }}>
        {mb && <span style={{
          fontSize: 10, fontWeight: 600, color: mb.color,
          background: `${mb.color}18`, padding: '2px 6px', borderRadius: 3,
        }}>{mb.name}</span>}
        {m.attachment && <span style={{ color: t.ter, display: 'flex' }}>{I.paperclip(11)}</span>}
      </div>
    </div>
  );
}

function MailList({ dark, active, setActive, mailboxFilter, aiEnabled }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const [tab, setTab] = React.useState('inbox');
  const all = MAIL_GROUPS.flatMap(g => g.items.map(m => ({ ...m, _group: g.title })));
  const filtered = mailboxFilter ? all.filter(m => m.mailbox === mailboxFilter) : all;

  return (
    <div style={{
      width: 360, height: '100%', borderRight: `1px solid ${t.sep}`,
      display: 'flex', flexDirection: 'column', background: t.bgPane, flexShrink: 0,
    }}>
      {/* header */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.label, letterSpacing: -0.3 }}>Входящие</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn icon={I.filter(14)} t={t} dark={dark}/>
            <IconBtn icon={I.plus(14)} t={t} dark={dark} primary accent={accent}/>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
          {[
            { k: 'inbox', label: 'Все', count: filtered.length },
            { k: 'unread', label: 'Непрочит.', count: filtered.filter(m => m.unread).length },
            { k: 'starred', label: '★', count: filtered.filter(m => m.starred).length },
          ].map(tb => (
            <div key={tb.k} onClick={() => setTab(tb.k)} style={{
              padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: tab === tb.k ? t.label : t.sec,
              borderBottom: `2px solid ${tab === tb.k ? accent : 'transparent'}`,
            }}>{tb.label} <span style={{ color: t.ter, marginLeft: 2 }}>{tb.count}</span></div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: t.sep }}/>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {['Сегодня', 'Вчера', 'На этой неделе'].map(group => {
          const items = filtered.filter(m => m._group === group && (tab === 'inbox' || (tab === 'unread' ? m.unread : m.starred)));
          if (!items.length) return null;
          return (
            <div key={group}>
              <div style={{
                padding: '10px 16px 6px', fontSize: 10.5, fontWeight: 700, color: t.ter,
                textTransform: 'uppercase', letterSpacing: 0.8,
                background: dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
              }}>{group}</div>
              {items.map(m => (
                <MailListItem key={m.id} m={m} selected={active === m.id} onClick={() => setActive(m.id)} dark={dark} t={t} accent={accent}/>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IconBtn({ icon, t, dark, primary, accent, onClick, label }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      height: 26, minWidth: 26, padding: label ? '0 9px' : 0,
      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      background: primary ? accent : (hover ? t.bgHover : 'transparent'),
      color: primary ? '#fff' : t.sec, cursor: 'pointer', fontSize: 12, fontWeight: 600,
      border: primary ? 'none' : `1px solid ${hover ? t.sepStrong : 'transparent'}`,
    }}>
      {icon}{label && <span>{label}</span>}
    </div>
  );
}

function MailThread({ dark, messageId, aiEnabled }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  const all = MAIL_GROUPS.flatMap(g => g.items);
  const m = all.find(x => x.id === messageId) || all.find(x => x.highlighted) || all[0];
  const mb = MAILBOXES.find(x => x.id === m.mailbox);

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: t.bgPane, minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <IconBtn icon={I.archive(14)} t={t} dark={dark} label="Архив"/>
        <IconBtn icon={I.trash(14)} t={t} dark={dark} label="Удалить"/>
        <div style={{ width: 1, height: 18, background: t.sep, margin: '0 4px' }}/>
        <IconBtn icon={I.reply(14)} t={t} dark={dark} label="Ответить"/>
        <IconBtn icon={I.forward(14)} t={t} dark={dark} label="Переслать"/>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: t.ter }}>
          <kbd style={kbdStyle(t, dark)}>J</kbd><kbd style={kbdStyle(t, dark)}>K</kbd>
          <span>навигация</span>
          <span style={{ margin: '0 4px' }}>·</span>
          <kbd style={kbdStyle(t, dark)}>E</kbd>
          <span>архив</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 60px' }}>
        {/* subject + meta */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.label, margin: 0, letterSpacing: -0.5, lineHeight: '28px', flex: 1 }}>{m.subject}</h1>
            <span style={{ color: DT.gold, cursor: 'pointer', display: 'flex', marginTop: 6 }}>{I.star(18)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {mb && <span style={{
              fontSize: 11, fontWeight: 600, color: mb.color,
              background: `${mb.color}18`, padding: '3px 8px', borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: mb.color }}/>
              {mb.name}
            </span>}
            <span style={{ fontSize: 12, color: t.ter }}>·</span>
            <span style={{ fontSize: 12, color: t.ter }}>17 апреля 2026, 08:46</span>
          </div>
        </div>

        {/* AI summary */}
        {aiEnabled && (
          <div style={{
            padding: 14, borderRadius: 10, marginBottom: 20,
            background: dark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)',
            border: `1px solid ${dark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.18)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: accent, display: 'flex' }}>{I.sparkle(14)}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>AI · Суть письма</span>
              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 11, color: t.ter, cursor: 'pointer' }}>Обновить</span>
            </div>
            <div style={{ fontSize: 13.5, color: t.label, lineHeight: '20px', marginBottom: 10 }}>
              Россети Урал сообщают о завершении мероприятий по обращению <b style={{ color: accent }}>МРСК-П-3117</b> (восстановление документов о тех.присоединении). Запрашивают оценку работ по 5-балльной шкале.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['📋 Создать задачу', '📎 Сохранить вложения', '↩ Подготовить ответ', '⭐ Оценить 5'].map(c => (
                <button key={c} style={chipStyle(t, dark)}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {/* From card */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 0', borderBottom: `1px solid ${t.sep}`, marginBottom: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20, flexShrink: 0,
            background: mb ? mb.color : accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
          }}>{m.fromName.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>{m.fromName}</div>
            <div style={{ fontSize: 12, color: t.ter, marginTop: 2 }}>
              <b style={{ color: t.sec, fontWeight: 500 }}>кому:</b> pluton.estate.59@mail.ru
            </div>
          </div>
          <div style={{ fontSize: 12, color: t.ter }}>17.04.2026, 08:46</div>
        </div>

        {/* Body */}
        <div style={{ fontSize: 14, color: t.label, lineHeight: '22px', letterSpacing: -0.1, maxWidth: 760 }}>
          <p style={{ margin: '0 0 14px' }}>Уважаемый клиент!</p>
          <p style={{ margin: '0 0 14px' }}>
            Запланированные мероприятия (Восстановление и переоформление документов о технологическом присоединении) по обращению <b style={{ color: accent }}>МРСК-П-3117</b> исполнены.
          </p>
          <p style={{ margin: '0 0 14px' }}>
            Обратную связь Вы можете оставить в интернет-приёмной rosseti-ural.ru/client/feedback или по электронной почте client@rosseti-ural.ru.
          </p>
          <p style={{ margin: '0 0 14px' }}>Оцените выполненные работы по 5-балльной шкале:</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} style={{
                width: 42, height: 42, borderRadius: 8,
                border: `1px solid ${t.sep}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 600, color: t.sec, cursor: 'pointer',
                background: n === 5 ? `${accent}18` : 'transparent',
                borderColor: n === 5 ? accent : t.sep,
              }}>{n}</div>
            ))}
          </div>
          <p style={{ margin: '0 0 14px', color: t.sec, fontSize: 13 }}>С уважением, Россети Урал</p>
          <div style={{
            padding: 14, background: t.bgHover, borderLeft: `3px solid ${t.sep}`,
            borderRadius: '0 6px 6px 0', fontSize: 12, color: t.sec, lineHeight: '17px',
            marginTop: 20,
          }}>
            Электричество — неотъемлемая часть жизни современного человека. Не забывайте, что кроме пользы, оно таит в себе потенциальную угрозу. Соблюдайте правила электробезопасности.
          </div>
        </div>

        {/* Attachments */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ter, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Вложения · 2</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { n: 'МРСК-П-3117_акт.pdf', s: '184 КБ' },
              { n: 'Тех.присоединение.pdf', s: '312 КБ' },
            ].map(a => (
              <div key={a.n} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 10px 10px',
                border: `1px solid ${t.sep}`, borderRadius: 8, minWidth: 240, cursor: 'pointer',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 6, background: `${DT.red}18`,
                  color: DT.red, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                }}>PDF</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.n}</div>
                  <div style={{ fontSize: 11, color: t.ter, marginTop: 1 }}>{a.s}</div>
                </div>
                <span style={{ color: t.ter, display: 'flex' }}>{I.download(14)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reply box */}
        <div style={{
          marginTop: 28, padding: 14, border: `1px solid ${t.sep}`, borderRadius: 10,
          background: t.bgPane,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <Avatar letter="К" color={accent} size={24}/>
            <span style={{ fontSize: 12.5, color: t.sec }}>Ответить <b style={{ color: t.label, fontWeight: 600 }}>{m.fromName}</b></span>
            <div style={{ flex: 1 }}/>
            {aiEnabled && <button style={chipStyle(t, dark, accent)}>{I.sparkle(12)} Написать за меня</button>}
          </div>
          <div style={{
            minHeight: 64, padding: 10, borderRadius: 6, background: t.bgHover,
            fontSize: 13, color: t.ter, lineHeight: '18px',
          }}>Напишите ответ…</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
            <div style={{ padding: '6px 12px', background: accent, color: '#fff', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Отправить
              <kbd style={{ ...kbdStyle(t, dark), background: 'rgba(255,255,255,0.2)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>⌘⏎</kbd>
            </div>
            <IconBtn icon={I.paperclip(14)} t={t} dark={dark}/>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 11.5, color: t.ter }}>Черновик сохраняется автоматически</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function kbdStyle(t, dark) {
  return {
    padding: '1px 5px', borderRadius: 3, fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    color: t.sec, border: `1px solid ${t.sep}`,
  };
}

function chipStyle(t, dark, accent) {
  return {
    padding: '5px 10px', borderRadius: 6, border: `1px solid ${t.sep}`,
    background: t.bgPane, color: accent || t.sec,
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontFamily: 'inherit',
  };
}

function DesktopMail({ dark, aiEnabled, mailboxFilter }) {
  const [active, setActive] = React.useState('m3'); // the highlighted rosseti one

  return (
    <div style={{ display: 'flex', height: '100%', minWidth: 0, flex: 1 }}>
      <MailList dark={dark} active={active} setActive={setActive} mailboxFilter={mailboxFilter} aiEnabled={aiEnabled}/>
      <MailThread dark={dark} messageId={active} aiEnabled={aiEnabled}/>
    </div>
  );
}

Object.assign(window, { DesktopMail, IconBtn, kbdStyle, chipStyle });
