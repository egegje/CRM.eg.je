# CRMApp — нативный iOS клиент для crm.eg.je

Полностью нативное SwiftUI-приложение. Не WebView. Общается с тем же REST API что и веб-версия (https://crm.eg.je), cookies сессии хранятся в HTTPCookieStorage.

## Что умеет сейчас (milestone 1)

- Экран логина (POST /auth/login), ошибки показываются
- Автопроверка сессии при запуске (GET /me)
- Нижний TabBar: Задачи / Почта / Финансы / Ещё
- Задачи: список с 5 фильтрами (Мои / Поставлено мной / Без исполнителя / Просроченные / Выполненные), приоритеты иконками, дедлайны, проекты, pull-to-refresh
- Экран задачи: заголовок/описание, segmented picker статуса (меняет на сервере сразу), метаданные, комментарии
- Вкладка «Ещё»: профиль, выход

Почта и Финансы пока заглушки — это следующие milestone'ы.

## Как собрать на Маке в первый раз

```bash
# 1. Установи XcodeGen (один раз)
brew install xcodegen

# 2. Склонируй репо
git clone https://github.com/egegje/crm.eg.je.git
cd crm.eg.je/ios

# 3. Сгенерируй Xcode проект (каждый раз после git pull)
xcodegen generate

# 4. Открой
open CRMApp.xcodeproj
```

В Xcode:

1. **CRMApp target → Signing & Capabilities**
2. **Team** = выбрать свой Apple ID (если нет: Xcode → Settings → Accounts → + → Apple ID)
3. **Bundle Identifier** возможно придётся поменять — `je.eg.crm.CRMApp` может быть занят. Поставь уникальное, например `je.eg.crm.CRMApp.<твоёимя>`
4. Подключи iPhone по кабелю
5. На iPhone: Settings → Privacy & Security → Developer Mode → On (перезагрузка)
6. В Xcode в селекторе устройств сверху выбери свой iPhone
7. Жми ▶ Run

После первого запуска на iPhone: Settings → General → VPN & Device Management → Developer App → Trust для своего Apple ID.

## Обновления

Я пушу в git → ты делаешь:

```bash
cd ~/crm.eg.je
git pull
cd ios
xcodegen generate   # нужно только если добавились новые .swift файлы
open CRMApp.xcodeproj
```

И ▶ Run заново.

## Структура кода

```
ios/
  project.yml               ← конфиг XcodeGen
  CRMApp/
    CRMApp.swift            ← @main, инициализирует AuthStore
    API/
      APIClient.swift       ← URLSession wrapper, cookies, JSON
    Models/
      User.swift
      Task.swift            ← CRMTask, Project, TaskComment, TaskTag, TaskAttachment, TeamMemberStats
    Stores/
      AuthStore.swift       ← @MainActor ObservableObject (user, login, logout, checkSession)
      TasksStore.swift      ← load tasks with filters, patch status
    Views/
      RootView.swift        ← switches Login ↔ MainTabs, contains MainTabs/MoreView
      LoginView.swift
      TaskListView.swift    ← список задач + фильтры
      TaskDetailView.swift  ← экран конкретной задачи
    Assets.xcassets/        ← иконка и акцентный цвет (иконка пустая пока)
    Info.plist              ← permissions (camera, photo, mic, face id)
```

## Roadmap

**Фаза 1 (сейчас → следующий релиз)**
- [x] Auth + session
- [x] Task list + filters + detail
- [ ] Create/edit задачи (форма)
- [ ] Канбан с drag-n-drop
- [ ] Теги, комментарии (input)
- [ ] Push-уведомления при назначении (APNs)
- [ ] Face ID для входа в приложение

**Фаза 2**
- [ ] Почта: inbox с пагинацией, превью, отметить прочитанным, удалить
- [ ] Compose (кому, тема, тело, отправить)
- [ ] Поиск
- [ ] Персоны / подписи

**Фаза 3**
- [ ] Финансы: компании, счета, итоги
- [ ] Команда: дашборд, переход в канбан
- [ ] Админ: юзеры, ящики (базовое)

## Troubleshooting

**«no account for team» / «no provisioning profile»** — в Signing не выбран Apple ID, исправь в вкладке Signing & Capabilities.

**«bundle id already in use»** — поменяй `je.eg.crm.CRMApp` на что-то уникальное.

**«could not launch» после установки** — доверь developer profile в Settings → General → VPN & Device Management.

**Сессия отваливается при перезапуске** — проверь что `HTTPCookieStorage.shared` работает; по умолчанию cookies сохраняются между запусками автоматически.

**Ошибки компиляции после git pull** — запусти `xcodegen generate` ещё раз, и перезапусти Xcode.
