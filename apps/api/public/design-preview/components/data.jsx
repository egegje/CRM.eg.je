// Tokens for the premium CRM design
const TOKENS = {
  // Deep indigo with electric accent + gold highlights
  accent: '#6366F1',        // indigo-500
  accentDeep: '#4F46E5',    // indigo-600
  accentSoft: '#EEF2FF',
  accentGlow: 'rgba(99,102,241,0.35)',
  gold: '#EAB308',
  goldSoft: '#FEF9C3',
  // Status
  green: '#10B981',
  greenSoft: '#D1FAE5',
  orange: '#F59E0B',
  orangeSoft: '#FEF3C7',
  red: '#EF4444',
  redSoft: '#FEE2E2',
  blue: '#3B82F6',
  blueSoft: '#DBEAFE',
  violet: '#8B5CF6',
  // Neutrals light
  bg: '#F5F5F7',
  bgGlass: 'rgba(245,245,247,0.72)',
  card: '#FFFFFF',
  cardEl: '#F9FAFB',
  label: '#0A0A0B',
  sec: '#6B7280',
  ter: '#9CA3AF',
  quart: '#D1D5DB',
  sep: 'rgba(0,0,0,0.06)',
  // Dark
  d_bg: '#0A0A0B',
  d_bg2: '#0F0F12',
  d_card: '#161619',
  d_cardEl: '#1F1F24',
  d_label: '#FFFFFF',
  d_sec: '#A1A1AA',
  d_ter: '#71717A',
  d_sep: 'rgba(255,255,255,0.06)',
};

function theme(dark) {
  return dark ? {
    bg: TOKENS.d_bg, bg2: TOKENS.d_bg2,
    card: TOKENS.d_card, cardEl: TOKENS.d_cardEl,
    label: TOKENS.d_label, sec: TOKENS.d_sec, ter: TOKENS.d_ter,
    sep: TOKENS.d_sep, accent: TOKENS.accent,
  } : {
    bg: TOKENS.bg, bg2: '#FAFAFC',
    card: TOKENS.card, cardEl: TOKENS.cardEl,
    label: TOKENS.label, sec: TOKENS.sec, ter: TOKENS.ter,
    sep: TOKENS.sep, accent: TOKENS.accent,
  };
}

// Mailbox colors (from screenshot)
const MAILBOXES = [
  { id: 'metr', name: 'МЕТР', unread: 13, color: '#6366F1', letter: 'М' },
  { id: 'ekat', name: 'ekaterina.rental', unread: 10, color: '#EC4899', letter: 'Е' },
  { id: 'venera', name: 'Венера', unread: 2, color: '#F59E0B', letter: 'В' },
  { id: 'gnatuk', name: 'Гнатюк', unread: 0, color: '#10B981', letter: 'Г' },
  { id: 'kvadrat', name: 'Квадрат', unread: 0, color: '#8B5CF6', letter: 'К' },
  { id: 'krem', name: 'Крем', unread: 0, color: '#EF4444', letter: 'К' },
  { id: 'metr2', name: 'Метр', unread: 1, color: '#06B6D4', letter: 'М' },
  { id: 'neptun', name: 'Нептун', unread: 0, color: '#3B82F6', letter: 'Н' },
  { id: 'pluton', name: 'Плутон', unread: 4, color: '#A855F7', letter: 'П' },
  { id: 'pyljar', name: 'Пыл Жар', unread: 0, color: '#F97316', letter: 'П' },
  { id: 'saturn', name: 'Сатурн', unread: 0, color: '#D946EF', letter: 'С' },
  { id: 'semenov', name: 'Семёнов', unread: 0, color: '#0EA5E9', letter: 'С' },
  { id: 'tmserv', name: 'ТМ Сервис Уфа', unread: 0, color: '#EAB308', letter: 'Т' },
  { id: 'jupiter', name: 'Юпитер', unread: 0, color: '#F59E0B', letter: 'Ю' },
];

// Mail samples modelled on the real screenshot
const MAIL_GROUPS = [
  {
    title: 'Сегодня',
    items: [
      { id: 'm1', mailbox: 'metr', fromName: 'МУПП «Саратовводоканал»', subject: 'Напоминание о необходимости подачи показаний', preview: 'Уважаемый клиент! Напоминаем Вам о необходимости подать показания приборов учёта за апрель 2026 года до 25 числа.', time: '10:34', unread: true, starred: true, attachment: false, avatarColor: '#6366F1', letter: 'М' },
    ],
  },
  {
    title: 'Вчера',
    items: [
      { id: 'm2', mailbox: 'metr', fromName: 'МУП Уфаводоканал', subject: 'Отчёт по показаниям приборов учёта', preview: 'Сформирован отчёт за период с 01.04.2026 по 18.04.2026', time: '18 апр', unread: true, starred: false, attachment: true, avatarColor: '#06B6D4', letter: 'У' },
    ],
  },
  {
    title: 'На этой неделе',
    items: [
      { id: 'm3', mailbox: 'pluton', fromName: 'otvet@rosseti-ural.ru', subject: 'не прошло проверку сопоставления доменов', preview: 'Уважаемый клиент! Запланированные мероприятия (Восстановление и переоформление документов о технологическом присоединении) по обращению МРСК-П-3117 исполнены.', time: '17 апр', unread: false, starred: true, attachment: true, aiSummary: 'Россети Урал: мероприятия по обращению МРСК-П-3117 исполнены. Запрошена оценка работ.', avatarColor: '#6366F1', letter: 'О', highlighted: true },
      { id: 'm4', mailbox: 'metr', fromName: 'noreply@cdek.ru', subject: 'Заказ 1025304873. Поступил в пункт выдачи', preview: 'Вам доступен 1 заказ к получению. Пункт выдачи: ул. Ленина, 24.', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#10B981', letter: 'С' },
      { id: 'm5', mailbox: 'pluton', fromName: 'lepteva_alg@adm.tver.ru', subject: 'Re: Fwd: Self: Re: Расторжение договора', preview: 'Добрый день! Теперь я не могу до вас дозвониться. Просьба перезвонить.', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#F59E0B', letter: 'Л' },
      { id: 'm6', mailbox: 'pluton', fromName: 'BoytsevaVV@eptenergo.ru', subject: 'Re: Петербургтеплоэнерго — г. Санкт-Петербург', preview: 'Добрый день. Договор теплоснабжения направлен на согласование.', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#EF4444', letter: 'Б' },
      { id: 'm7', mailbox: 'metr', fromName: 'portal-tp@rosseti.ru', subject: 'Изменение статуса заявки № 17847', preview: 'Статус Вашей заявки изменён на «В работе».', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#10B981', letter: 'П' },
      { id: 'm8', mailbox: 'pluton', fromName: 'vmechti@mail.ru', subject: 'Re: Re: Письмо о расторжении договора', preview: 'Мы благодарим Вас за обращение. Ваш вопрос рассматривается.', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#A855F7', letter: 'В' },
      { id: 'm9', mailbox: 'metr', fromName: 'portal-tp@rosseti.ru', subject: 'Заявка № 17847652 успешно отправлена', preview: 'Заявка зарегистрирована под номером 17847652.', time: '17 апр', unread: false, starred: false, attachment: false, avatarColor: '#10B981', letter: 'П' },
    ],
  },
];

// Kanban tasks (modelled on screenshot)
const KANBAN = {
  open: [
    { id: 'k1', title: 'Причесать metr-таблицы по аудиту', due: '10.04.2026', overdue: true, priority: 'low' },
    { id: 'k2', title: 'Налоговая отчётность', due: '12.04.2026', overdue: true, priority: 'high' },
    { id: 'k3', title: 'Разобраться с налогами ПЛС и бухгалтером', due: '10.04.2026', overdue: true, priority: 'normal' },
    { id: 'k4', title: 'Начать использовать CRM', due: '13.04.2026', overdue: true, priority: 'normal' },
    { id: 'k5', title: 'Приводить в порядок таблицы', due: '13.04.2026', overdue: true, priority: 'high' },
    { id: 'k6', title: 'Отчётность USA', due: '14.04.2026', overdue: true, priority: 'low' },
    { id: 'k7', title: 'Выкуп объекта «Омск, ул. Карла Маркса, д. 11 490,2 кв» — 18.04.2026', due: '18.04.2026', overdue: true, priority: 'normal', project: 'Омск, ул. Карла Маркса, д. 11 490,2 кв' },
    { id: 'k8', title: 'Выкуп объекта «Омск, ул. Карла Маркса, д. 11 956,3 кв» — 18.04.2026', due: '19.04.2026', overdue: false, priority: 'normal', project: 'Омск, ул. Карла Маркса, д. 11 956,3 кв' },
    { id: 'k9', title: 'Закончить тестирование', due: '20.04.2026', overdue: false, priority: 'normal' },
    { id: 'k10', title: 'Выкуп объекта «Омск, ул. Харьковская, д. 27» — 24.04.2026', due: '27.04.2026', overdue: false, priority: 'low', project: 'Омск, ул. Харьковская, д. 27' },
    { id: 'k11', title: 'drift.eg.je: контент-блог /blog', project: 'drift.eg.je SEO', priority: 'low' },
    { id: 'k12', title: 'drift.eg.je: эмодзи в меню на Lucide SVG', project: 'drift.eg.je SEO', priority: 'low' },
    { id: 'k13', title: 'drift.eg.je: backlinks', project: 'drift.eg.je SEO', priority: 'low' },
  ],
  in_progress: [
    { id: 'k20', title: 'Посмотреть функционал сайта', due: '27.04.2026', priority: 'normal' },
    { id: 'k21', title: 'Посчитать смету по объекту X', due: '09.04.2026', overdue: true, priority: 'high' },
  ],
  done: [
    { id: 'k30', title: 'Сделай задачу', due: '07.04.2026', priority: 'normal' },
    { id: 'k31', title: 'Провести тестирование', due: '08.04.2026', priority: 'normal' },
    { id: 'k32', title: '3 советская', due: '10.04.2026', priority: 'urgent', project: 'ОПС, ул. 3-я Советская, д. 3/3', tags: ['15.04.2025'] },
    { id: 'k33', title: 'Сменить директора', due: '16.04.2026', priority: 'normal' },
    { id: 'k34', title: '123', due: '17.04.2026', priority: 'low' },
    { id: 'k35', title: 'Задача 123', priority: 'low' },
  ],
  cancelled: [
    { id: 'k40', title: 'Скачать сертификат и закрытый ключ из Сбера', due: '07.04.2026', priority: 'low' },
    { id: 'k41', title: 'Тестирование задачи', due: '07.04.2026', priority: 'low' },
    { id: 'k42', title: 'Протестировать вкладку Финансы', due: '08.04.2026', priority: 'high' },
    { id: 'k43', title: 'Поверка', priority: 'low' },
  ],
};

// Statement rows (from screenshot)
const STATEMENT = {
  account: '40802810955040002879',
  period: '20.03.2026 — 19.04.2026',
  expense: 5717393.52,
  expenseCount: 136,
  income: 6421180.00,
  incomeCount: 13,
  total: 703786.48,
  totalCount: 149,
  transactions: [
    { date: '12.04', counterparty: 'СЕВЕРО-ЗАПАДНЫЙ БАНК ПАО СБЕРБАНК', purpose: 'Комиссия в другие банки (кредитные организации, Банк России) за ДБО через ДБО. Без НДС. Договор РКО №40802810955040...', amount: -500.00 },
    { date: '12.04', counterparty: 'ООО «ПЛУТОН ЭСТЕЙТ»', purpose: 'по договору от 12.04.2026. НДС не облагается', amount: -50000.00 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 1046910072 от 31 Марта 2026 года за услуги по договору №31-218729-НП-ВО от 09.10.2025 г. (март 20)', amount: -117.03 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 2982970118 от 31 Марта 2026 года за услуги по договору №13-215052-НП-ВО от 06.08.2025 г. (март 20)', amount: -135.02 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 2019850010 от 31 Марта 2026 года за услуги по договору №31-214990-НП-ВО от 08.08.2025 г.', amount: -115.25 },
    { date: '12.04', counterparty: 'ООО «ГТКОМ»', purpose: 'Оплата за УГЦ 1040002362 от 31 Марта 2026 г. за тепловую энергию, тепловую мощность на март 2026 г. Договор теплоснабжения.', amount: -5186.47 },
    { date: '12.04', counterparty: 'ООО «ДИПЛОМАТ»', purpose: 'Оплата по счёту № 1135 от 31 марта 2026 за СОМ, оплата за нежилое помещение за март 2026 г. (Договор №124/1/25 от 1.)', amount: -309.40 },
    { date: '12.04', counterparty: 'МУП УИС', purpose: 'Оплата за тепловую энергию (ГВС) (Договор 1040072) за март 2026 г. НДС не облагается', amount: -1303.46 },
    { date: '12.04', counterparty: 'АО «СПЕЦАВТОБАЗА»', purpose: 'Оплата за Обращение с ТКО за март 2026 г. (Договор №40175301 от 08.04.2025). Счёт №7984 от 31 марта 2026 г. В том ч...', amount: -96.36 },
    { date: '12.04', counterparty: 'ООО «БАШРТС»', purpose: 'Оплата по счёту №T2026-15712/01 от 31.03.2026 г. за тепловую энергию по договору №464630-РТС от 02.02.2025 г. (март 20)', amount: -9032.22 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 2029450017 от 31 Марта 2026 года за услуги по договору №32-215815-НП-ВО от 12.08.2025 г. (март 20)', amount: -27.00 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 7009450009 от 31 Марта 2026 года за услуги по договору №31-214564-НП-ВО от 18.08.2025 г. (март)', amount: -23.05 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 9166120015 от 31 Марта 2026 года за услуги по договору №32-216815-НП-ВО от 12.08.2025 г. (март 2)', amount: -1161.44 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 2031670008 от 31 Марта 2026 года за услуги по договору №31-216814-НП-ВО от 22.08.2025 г. за март 2', amount: -991.42 },
    { date: '12.04', counterparty: 'ГУП «ВОДОКАНАЛ САНКТ-ПЕТЕРБУРГА»', purpose: 'Оплата по счёту № 8301460009 от 31 Марта 2026 года за услуги по договору №06-217374-НП-ВО от 14.10.2025. В том числе', amount: -141.76 },
    { date: '12.04', counterparty: 'ООО «ЖКХ ЛЕНИНСКОЕ»', purpose: 'Оплата за ком. расходы на содержание ОДИ (ЕЛС М10ВЕ5406410) за март 2026 г. Счёт №389 от 13 марта 2026 г. НДС не обл', amount: -36.03 },
    { date: '12.04', counterparty: 'Акционерное общество «ДОМОУПРАВЛЯЮЩАЯ КОМПАНИЯ СОВЕТСКОГО РАЙ…»', purpose: 'Оплата за СОМ, ТО и ком. услуги по договору №14/30 от 28.11.2025 г. за март 2026 г. В том числе НДС — 29,73 рублей.', amount: -297.48 },
    { date: '12.04', counterparty: 'ООО «ЖКХ ЛЕНИНСКОЕ»', purpose: 'Оплата за содержание ОДИ (ЕЛС М10ВЕ5406410) за март 2026 г. Счёт №588 от 13 марта 2026 г. В том числе НДС 5% — 16,11', amount: -338.25 },
    { date: '12.04', counterparty: 'Акционерное общество «ДОМОУПРАВЛЯЮЩАЯ КОМПАНИЯ СОВЕТСКОГО РАЙ…»', purpose: 'Оплата за КСБП-001158 от 28 Февраля 2026 г. ТО и ком. услуги по договору №14/30 от 28.11.2025 г. за феврал...', amount: -297.48 },
  ],
};

Object.assign(window, { TOKENS, theme, MAILBOXES, MAIL_GROUPS, KANBAN, STATEMENT });
