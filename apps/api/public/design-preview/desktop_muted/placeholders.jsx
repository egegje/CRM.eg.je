// Placeholder screens for Properties / Contacts / Docs / Analytics

function ScreenPlaceholder({ title, icon, dark, description, items }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgPane, minWidth: 0, overflow: 'auto' }}>
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: accent, display: 'flex' }}>{icon}</span>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.label, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ flex: 1 }}/>
        <IconBtn icon={I.filter(14)} t={t} dark={dark} label="Фильтр"/>
        <IconBtn icon={I.plus(14)} t={t} dark={dark} primary accent={accent} label="Добавить"/>
      </div>
      <div style={{ padding: 20, flex: 1 }}>
        <div style={{
          padding: '16px 18px', borderRadius: 10, marginBottom: 16,
          background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${t.sep}`,
          fontSize: 13, color: t.sec, lineHeight: '19px',
        }}>{description}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: 10, background: t.bgPane,
              border: `1px solid ${t.sep}`, cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: `${it.color}18`, color: it.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                }}>{it.letter}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  {it.sub && <div style={{ fontSize: 11.5, color: t.ter, marginTop: 1 }}>{it.sub}</div>}
                </div>
                {it.status && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                    background: `${it.statusColor}18`, color: it.statusColor,
                    textTransform: 'uppercase', letterSpacing: 0.6,
                  }}>{it.status}</span>
                )}
              </div>
              {it.meta && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: t.ter, paddingTop: 8, borderTop: `1px solid ${t.sep}` }}>
                  {it.meta}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopProperties({ dark }) {
  return <ScreenPlaceholder title="Объекты" icon={I.building(18)} dark={dark}
    description="Портфель коммерческой недвижимости: 24 объекта в работе, 3 готовятся к выкупу в апреле. Каждый объект — отдельный kanban с задачами, документами и платежами."
    items={[
      { letter: 'О', color: DT.violet, title: 'Омск, ул. Карла Маркса, д. 11', sub: '490,2 кв. м · выкуп 18.04', status: 'Скоро', statusColor: DT.orange, meta: <><span>4 задачи</span><span>·</span><span>18 документов</span></> },
      { letter: 'О', color: DT.violet, title: 'Омск, ул. Карла Маркса, д. 11 (956,3)', sub: '956,3 кв. м · выкуп 19.04', status: 'Скоро', statusColor: DT.orange, meta: <><span>6 задач</span><span>·</span><span>22 документа</span></> },
      { letter: 'О', color: DT.violet, title: 'Омск, ул. Харьковская, д. 27', sub: '710 кв. м · выкуп 27.04', status: 'План', statusColor: DT.blue, meta: <><span>2 задачи</span><span>·</span><span>9 документов</span></> },
      { letter: 'С', color: DT.accent, title: 'СПб, 3-я Советская, д. 3/3', sub: 'ОПС · в управлении', status: 'Актив', statusColor: DT.green, meta: <><span>12 задач</span><span>·</span><span>47 документов</span></> },
      { letter: 'У', color: DT.blue, title: 'Уфа, производственная база', sub: '2 400 кв. м · аренда', status: 'Актив', statusColor: DT.green, meta: <><span>8 задач</span><span>·</span><span>34 документа</span></> },
      { letter: 'Т', color: DT.green, title: 'Тверь, ул. Советская', sub: 'офисное · расторжение', status: 'Экзит', statusColor: DT.red, meta: <><span>3 задачи</span><span>·</span><span>11 документов</span></> },
    ]}/>;
}

function DesktopContacts({ dark }) {
  return <ScreenPlaceholder title="Контрагенты" icon={I.users(18)} dark={dark}
    description="Поставщики, подрядчики, партнёры. Вся переписка, договоры и платежи — привязаны к карточке контрагента."
    items={[
      { letter: 'Р', color: DT.violet, title: 'Россети Урал', sub: '12 писем · 3 договора', meta: <><span>Активна</span><span>·</span><span>долг: 0 ₽</span></> },
      { letter: 'В', color: DT.blue, title: 'ГУП «Водоканал СПб»', sub: '46 платежей за период', meta: <><span>Подрядчик</span></> },
      { letter: 'С', color: DT.orange, title: 'АО «Спецавтобаза»', sub: 'ТКО · договор №40175301', meta: <><span>Подрядчик</span></> },
      { letter: 'Б', color: DT.red, title: 'ООО «БашРТС»', sub: 'тепло · договор №464630-РТС', meta: <><span>Подрядчик</span></> },
      { letter: 'П', color: DT.accent, title: 'ООО «ПЛУТОН ЭСТЕЙТ»', sub: 'аффилированное', status: 'Группа', statusColor: DT.accent, meta: null },
      { letter: 'Л', color: DT.gold, title: 'Лептева А.Г. (адм. Тверь)', sub: 'муниципальный контакт', meta: null },
    ]}/>;
}

function DesktopDocs({ dark }) {
  return <ScreenPlaceholder title="Документы" icon={I.doc(18)} dark={dark}
    description="Шаблоны договоров, актов, доверенностей. AI помогает заполнить — подставляет реквизиты из карточек контрагентов и объектов."
    items={[
      { letter: 'Д', color: DT.accent, title: 'Договор аренды (шаблон)', sub: 'обновлён 12.04.2026', status: 'Шаблон', statusColor: DT.accent },
      { letter: 'А', color: DT.green, title: 'Акт приёма-передачи', sub: 'обновлён 18.04.2026', status: 'Шаблон', statusColor: DT.accent },
      { letter: 'Д', color: DT.red, title: 'МРСК-П-3117_акт.pdf', sub: '184 КБ · от Россети Урал', meta: <><span>От 17.04.2026</span></> },
      { letter: 'Д', color: DT.red, title: 'Тех.присоединение.pdf', sub: '312 КБ · от Россети Урал', meta: <><span>От 17.04.2026</span></> },
      { letter: 'Д', color: DT.violet, title: 'Доверенность на подписание', sub: 'шаблон · заполнить', status: 'Шаблон', statusColor: DT.accent },
    ]}/>;
}

function DesktopAnalytics({ dark }) {
  const t = dtheme(dark);
  const { accent } = React.useContext(window.DeskCtx);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgPane, minWidth: 0, overflow: 'auto' }}>
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${t.sep}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: accent, display: 'flex' }}>{I.chart(18)}</span>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.label, letterSpacing: -0.3 }}>Аналитика</div>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 12, color: t.sec }}>Q2 2026</span>
      </div>
      <div style={{ padding: 20, flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 10, background: t.bgPane, border: `1px solid ${t.sep}`, minHeight: 280 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.label, marginBottom: 14 }}>Cash-flow за 12 недель</div>
            {/* Simple bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180 }}>
              {[45, 62, 38, 71, 55, 48, 82, 66, 52, 78, 60, 70].map((h, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', height: `${h * 1.8}px`, borderRadius: 4,
                    background: i === 11 ? accent : `${accent}55`,
                  }}/>
                  <div style={{ fontSize: 10, color: t.ter, fontWeight: 500 }}>W{i + 1}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 12 }}>
              <div><span style={{ color: t.ter }}>Сред. нед:</span> <b style={{ color: t.label }}>61 320 ₽</b></div>
              <div><span style={{ color: t.ter }}>Макс:</span> <b style={{ color: DT.green }}>82 100 ₽</b></div>
              <div><span style={{ color: t.ter }}>Мин:</span> <b style={{ color: DT.red }}>38 400 ₽</b></div>
            </div>
          </div>

          <div style={{ padding: 16, borderRadius: 10, background: t.bgPane, border: `1px solid ${t.sep}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.label, marginBottom: 14 }}>Топ контрагентов</div>
            {[
              { name: 'ГУП «Водоканал СПб»', val: 2712, color: DT.blue, pct: 48 },
              { name: 'ООО «ГТКом»', val: 5186, color: DT.violet, pct: 92 },
              { name: 'ООО «БашРТС»', val: 9032, color: DT.red, pct: 100 },
              { name: 'АО «Спецавтобаза»', val: 96, color: DT.orange, pct: 6 },
              { name: 'ООО «Диплoмат»', val: 309, color: DT.green, pct: 18 },
            ].map((x, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: t.label, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                  <span style={{ color: t.sec, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(-x.val)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: t.bgHover, overflow: 'hidden' }}>
                  <div style={{ width: `${x.pct}%`, height: '100%', background: x.color, borderRadius: 3 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopProperties, DesktopContacts, DesktopDocs, DesktopAnalytics });
