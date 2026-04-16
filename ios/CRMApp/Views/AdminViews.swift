import SwiftUI

// MARK: - Contacts

struct AdminContactsView: View {
    @State private var contacts: [Contact] = []
    @State private var query = ""
    @State private var isLoading = false
    @State private var scanMsg: String?

    var body: some View {
        List {
            Section {
                Button {
                    Task { await scan() }
                } label: {
                    Label("Просканировать историю писем", systemImage: "arrow.clockwise")
                }
                if let m = scanMsg {
                    Text(m).font(.caption).foregroundStyle(.secondary)
                }
            }

            Section("Контакты (\(contacts.count))") {
                ForEach(contacts) { c in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(c.name.isEmpty ? c.email : c.name).font(.subheadline)
                        Text(c.email).font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Text("Исп.: \(c.useCount)").font(.caption2).foregroundStyle(.tertiary)
                            if let d = c.lastUsedAt {
                                Text(d.formatted(date: .abbreviated, time: .omitted))
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            Task { await delete(c.id) }
                        } label: { Label("Удалить", systemImage: "trash") }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Email или имя")
        .onChange(of: query) { _, _ in Task { await load() } }
        .refreshable { await load() }
        .task { await load() }
        .navigationTitle("Контакты")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if isLoading && contacts.isEmpty { ProgressView() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        var path = "/admin/contacts?limit=200"
        if !query.isEmpty, let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "&q=\(q)"
        }
        contacts = (try? await APIClient.shared.request("GET", path, as: [Contact].self)) ?? []
    }

    private func scan() async {
        scanMsg = "Сканирую…"
        struct R: Codable { let added: Int?; let updated: Int? }
        let r = try? await APIClient.shared.request("POST", "/admin/contacts/scan-history", as: R.self)
        scanMsg = r.map { "Готово: добавлено \($0.added ?? 0), обновлено \($0.updated ?? 0)" } ?? "Готово"
        await load()
    }

    private func delete(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/contacts/\(id)")
        contacts.removeAll { $0.id == id }
    }
}

struct Contact: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String
    let useCount: Int
    let lastUsedAt: Date?
}

// MARK: - Users

struct AdminUsersView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var users: [AdminUser] = []
    @State private var showNew = false
    @State private var editing: AdminUser?

    private var isOwner: Bool { auth.user?.role == "owner" }

    var body: some View {
        List {
            ForEach(users) { u in
                Button {
                    editing = u
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(u.name).font(.subheadline).fontWeight(.medium)
                            Spacer()
                            Text(u.role)
                                .font(.caption2)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(roleColor(u.role).opacity(0.15))
                                .foregroundStyle(roleColor(u.role))
                                .clipShape(Capsule())
                        }
                        Text(u.email).font(.caption).foregroundStyle(.secondary)
                        if let d = u.lastLoginAt {
                            Text("Последний вход: \(d.formatted(date: .abbreviated, time: .shortened))")
                                .font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
                .buttonStyle(.plain)
                .swipeActions {
                    if isOwner {
                        Button(role: .destructive) {
                            Task { await delete(u.id) }
                        } label: { Label("Удалить", systemImage: "trash") }
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Пользователи")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showNew) {
            NewUserSheet { await load() }
        }
        .sheet(item: $editing) { u in
            EditUserSheet(user: u) { await load() }
        }
    }

    private func load() async {
        users = (try? await APIClient.shared.request("GET", "/admin/users", as: [AdminUser].self)) ?? []
    }

    private func delete(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/users/\(id)")
        users.removeAll { $0.id == id }
    }

    private func roleColor(_ r: String) -> Color {
        switch r {
        case "owner": return .purple
        case "admin": return .blue
        default: return .gray
        }
    }
}

struct AdminUser: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String
    let role: String
    let lastLoginAt: Date?
}

struct NewUserSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onDone: () async -> Void
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var role = "manager"
    @State private var busy = false
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Имя", text: $name)
                TextField("Email", text: $email).keyboardType(.emailAddress).autocapitalization(.none)
                SecureField("Пароль", text: $password)
                Picker("Роль", selection: $role) {
                    Text("manager").tag("manager")
                    Text("admin").tag("admin")
                    Text("owner").tag("owner")
                }
                if let e = errorMsg {
                    Text(e).foregroundStyle(.red).font(.caption)
                }
            }
            .navigationTitle("Новый пользователь")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await create() } }
                        .disabled(name.isEmpty || email.isEmpty || password.isEmpty || busy)
                }
            }
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let data = try JSONSerialization.data(withJSONObject: [
                "name": name, "email": email, "password": password, "role": role,
            ])
            var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/users")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = data
            let s = await APIClient.urlSession
            let (d, resp) = try await s.data(for: req)
            if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                errorMsg = String(data: d, encoding: .utf8) ?? "HTTP \(http.statusCode)"
                return
            }
            await onDone()
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

struct EditUserSheet: View {
    @Environment(\.dismiss) private var dismiss
    let user: AdminUser
    var onDone: () async -> Void
    @State private var name: String
    @State private var role: String
    @State private var busy = false

    init(user: AdminUser, onDone: @escaping () async -> Void) {
        self.user = user
        self.onDone = onDone
        _name = State(initialValue: user.name)
        _role = State(initialValue: user.role)
    }

    var body: some View {
        NavigationStack {
            Form {
                LabeledContent("Email", value: user.email)
                TextField("Имя", text: $name)
                Picker("Роль", selection: $role) {
                    Text("manager").tag("manager")
                    Text("admin").tag("admin")
                    Text("owner").tag("owner")
                }
            }
            .navigationTitle("Пользователь")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { Task { await save() } }.disabled(busy)
                }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let data = try? JSONSerialization.data(withJSONObject: ["name": name, "role": role])
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/users/\(user.id)")!)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await onDone()
        dismiss()
    }
}

// MARK: - Mailboxes

struct AdminMailboxesView: View {
    @State private var mailboxes: [AdminMailbox] = []
    @State private var showNew = false

    var body: some View {
        List {
            ForEach(mailboxes) { mb in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(mb.displayName).font(.subheadline).fontWeight(.medium)
                        Text(mb.email).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { mb.enabled },
                        set: { newVal in Task { await toggle(mb.id, newVal) } }
                    ))
                    .labelsHidden()
                }
                .swipeActions {
                    Button(role: .destructive) {
                        Task { await delete(mb.id) }
                    } label: { Label("Удалить", systemImage: "trash") }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Почтовые ящики")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showNew) {
            NewMailboxSheet { await load() }
        }
    }

    private func load() async {
        mailboxes = (try? await APIClient.shared.request("GET", "/admin/mailboxes", as: [AdminMailbox].self)) ?? []
    }

    private func toggle(_ id: String, _ on: Bool) async {
        let data = try? JSONSerialization.data(withJSONObject: ["enabled": on])
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/mailboxes/\(id)")!)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await load()
    }

    private func delete(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/mailboxes/\(id)")
        mailboxes.removeAll { $0.id == id }
    }
}

struct AdminMailbox: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let displayName: String
    let enabled: Bool
}

struct NewMailboxSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onDone: () async -> Void
    @State private var email = ""
    @State private var displayName = ""
    @State private var appPassword = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Email", text: $email).keyboardType(.emailAddress).autocapitalization(.none)
                TextField("Имя", text: $displayName)
                SecureField("App-пароль", text: $appPassword)
                Text("Для Яндекса / Mail.ru / Gmail нужен пароль приложения, не обычный.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .navigationTitle("Новый ящик")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await create() } }
                        .disabled(email.isEmpty || displayName.isEmpty || appPassword.isEmpty || busy)
                }
            }
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        let data = try? JSONSerialization.data(withJSONObject: [
            "email": email, "displayName": displayName, "appPassword": appPassword,
        ])
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/mailboxes")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await onDone()
        dismiss()
    }
}

// MARK: - Personas

struct AdminPersonasView: View {
    @State private var personas: [Persona] = []
    @State private var editing: Persona?
    @State private var showNew = false

    var body: some View {
        List {
            ForEach(personas) { p in
                Button { editing = p } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(p.name).font(.subheadline).fontWeight(.medium)
                        Text(p.signature)
                            .font(.caption).foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        Task { await delete(p.id) }
                    } label: { Label("Удалить", systemImage: "trash") }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Персоны")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showNew) {
            PersonaSheet(persona: nil) { await load() }
        }
        .sheet(item: $editing) { p in
            PersonaSheet(persona: p) { await load() }
        }
    }

    private func load() async {
        personas = (try? await APIClient.shared.request("GET", "/personas", as: [Persona].self)) ?? []
    }

    private func delete(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/personas/\(id)")
        personas.removeAll { $0.id == id }
    }
}

struct PersonaSheet: View {
    @Environment(\.dismiss) private var dismiss
    let persona: Persona?
    var onDone: () async -> Void
    @State private var name = ""
    @State private var signature = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Имя (например: Ульяна)", text: $name)
                Section("Подпись") {
                    TextEditor(text: $signature).frame(minHeight: 140)
                }
            }
            .navigationTitle(persona == nil ? "Новая персона" : "Редактировать")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { Task { await save() } }
                        .disabled(name.isEmpty || signature.isEmpty || busy)
                }
            }
            .onAppear {
                if let p = persona {
                    name = p.name
                    signature = p.signature
                }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let data = try? JSONSerialization.data(withJSONObject: ["name": name, "signature": signature])
        let url: URL
        let method: String
        if let p = persona {
            url = URL(string: "https://crm.eg.je/admin/personas/\(p.id)")!
            method = "PATCH"
        } else {
            url = URL(string: "https://crm.eg.je/admin/personas")!
            method = "POST"
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await onDone()
        dismiss()
    }
}

// MARK: - Rules

struct AdminRulesView: View {
    @State private var rules: [MailRule] = []
    @State private var showNew = false

    var body: some View {
        List {
            if rules.isEmpty {
                ContentUnavailableView(
                    "Нет правил",
                    systemImage: "line.3.horizontal.decrease",
                    description: Text("Правила перемещают входящую почту в папки по условиям.")
                )
            }
            ForEach(rules) { r in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.contains).font(.subheadline)
                        Text("\(r.triggerType) → \(r.folderId)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { r.enabled },
                        set: { v in Task { await toggle(r.id, v) } }
                    ))
                    .labelsHidden()
                }
                .swipeActions {
                    Button(role: .destructive) {
                        Task { await delete(r.id) }
                    } label: { Label("Удалить", systemImage: "trash") }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Правила")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNew = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showNew) {
            NewRuleSheet { await load() }
        }
    }

    private func load() async {
        rules = (try? await APIClient.shared.request("GET", "/admin/rules", as: [MailRule].self)) ?? []
    }

    private func toggle(_ id: String, _ on: Bool) async {
        let data = try? JSONSerialization.data(withJSONObject: ["enabled": on])
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/rules/\(id)")!)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await load()
    }

    private func delete(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/rules/\(id)")
        rules.removeAll { $0.id == id }
    }
}

struct MailRule: Codable, Identifiable, Hashable {
    let id: String
    let triggerType: String
    let contains: String
    let folderId: String
    let enabled: Bool
}

struct NewRuleSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onDone: () async -> Void
    @State private var triggerType = "from"
    @State private var contains = ""
    @State private var folderId = ""
    @State private var folders: [MailFolder] = []
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Picker("Триггер", selection: $triggerType) {
                    Text("От (отправитель)").tag("from")
                    Text("Кому").tag("to")
                    Text("Тема").tag("subject")
                }
                TextField("Содержит", text: $contains)
                Picker("В папку", selection: $folderId) {
                    Text("—").tag("")
                    ForEach(folders) { f in
                        Text(f.name).tag(f.id)
                    }
                }
            }
            .navigationTitle("Новое правило")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await create() } }
                        .disabled(contains.isEmpty || folderId.isEmpty || busy)
                }
            }
            .task {
                folders = (try? await APIClient.shared.request("GET", "/folders", as: [MailFolder].self)) ?? []
            }
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        let data = try? JSONSerialization.data(withJSONObject: [
            "triggerType": triggerType, "contains": contains, "folderId": folderId, "enabled": true,
        ])
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/rules")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        await onDone()
        dismiss()
    }
}

struct MailFolder: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

// MARK: - Task Settings

struct AdminTaskSettingsView: View {
    @State private var settings: [String: String] = [:]
    @State private var busy = false
    @State private var savedMsg: String?

    private let known: [(key: String, label: String, kind: Kind)] = [
        ("digest_time", "Время утреннего дайджеста (HH:MM)", .text),
        ("auto_close_days", "Авто-закрытие через дней", .number),
        ("ai_email_to_task", "AI детект задач из писем (true/false)", .text),
        ("metr_auto_task_days", "Metr: авто-задача за сколько дней до дедлайна", .number),
    ]

    enum Kind { case text, number }

    var body: some View {
        Form {
            ForEach(known, id: \.key) { item in
                HStack {
                    Text(item.label).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    TextField("", text: Binding(
                        get: { settings[item.key] ?? "" },
                        set: { settings[item.key] = $0 }
                    ))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(item.kind == .number ? .numberPad : .default)
                }
            }
            Section {
                Button("Сохранить") { Task { await save() } }.disabled(busy)
                if let m = savedMsg {
                    Text(m).font(.caption).foregroundStyle(.green)
                }
            }

            Section("Все ключи") {
                ForEach(Array(settings.keys.sorted()), id: \.self) { k in
                    if !known.contains(where: { $0.key == k }) {
                        HStack {
                            Text(k).font(.caption)
                            Spacer()
                            Text(settings[k] ?? "").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .task { await load() }
        .navigationTitle("Настройки задач")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func load() async {
        let s = await APIClient.urlSession
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/task-settings")!)
        req.httpMethod = "GET"
        if let (data, _) = try? await s.data(for: req),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            var out: [String: String] = [:]
            for (k, v) in obj {
                if let s = v as? String { out[k] = s }
                else if v is NSNull { out[k] = "" }
                else { out[k] = "\(v)" }
            }
            settings = out
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        savedMsg = nil
        let data = try? JSONSerialization.data(withJSONObject: settings)
        var req = URLRequest(url: URL(string: "https://crm.eg.je/admin/task-settings")!)
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let s = await APIClient.urlSession
        _ = try? await s.data(for: req)
        savedMsg = "Сохранено"
    }
}

// MARK: - Telegram

struct AdminTelegramView: View {
    @State private var chats: [TgChat] = []
    @State private var bindings: [TgBinding] = []
    @State private var users: [AdminUser] = []

    var body: some View {
        List {
            Section("Чаты для задач (#task)") {
                if chats.isEmpty {
                    Text("Нет привязанных чатов. В групповом чате напиши /register чтобы добавить.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(chats) { c in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(c.name).font(.subheadline)
                        Text("chatId: \(c.chatId)").font(.caption2).foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            Task { await deleteChat(c.chatId) }
                        } label: { Label("Удалить", systemImage: "trash") }
                    }
                }
            }

            Section("Привязки пользователей") {
                ForEach(bindings) { b in
                    let userName = users.first(where: { $0.id == b.userId })?.name ?? b.userId
                    VStack(alignment: .leading, spacing: 3) {
                        Text(userName).font(.subheadline)
                        Text("TG: \(b.tgUsername ?? "—") (\(b.tgUserId))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            Task { await deleteBinding(b.userId) }
                        } label: { Label("Отвязать", systemImage: "trash") }
                    }
                }
            }
        }
        .task { await loadAll() }
        .refreshable { await loadAll() }
        .navigationTitle("Telegram")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func loadAll() async {
        chats = (try? await APIClient.shared.request("GET", "/admin/tg-chats", as: [TgChat].self)) ?? []
        bindings = (try? await APIClient.shared.request("GET", "/admin/tg-bindings", as: [TgBinding].self)) ?? []
        users = (try? await APIClient.shared.request("GET", "/admin/users", as: [AdminUser].self)) ?? []
    }

    private func deleteChat(_ chatId: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/tg-chats/\(chatId)")
        await loadAll()
    }

    private func deleteBinding(_ userId: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/admin/tg-bindings/\(userId)")
        await loadAll()
    }
}

struct TgChat: Codable, Identifiable, Hashable {
    let chatId: String
    let name: String
    var id: String { chatId }
}

struct TgBinding: Codable, Identifiable, Hashable {
    let userId: String
    let tgUserId: String
    let tgUsername: String?
    var id: String { userId }
}

// MARK: - Audit

struct AdminAuditView: View {
    @State private var rows: [AuditRow] = []

    var body: some View {
        List {
            ForEach(rows) { r in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(r.action).font(.caption).fontWeight(.medium)
                        Spacer()
                        Text(r.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if let u = r.userId {
                        Text("user: \(u)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Журнал")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func load() async {
        rows = (try? await APIClient.shared.request("GET", "/admin/audit?limit=200", as: [AuditRow].self)) ?? []
    }
}

struct AuditRow: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let action: String
    let createdAt: Date
}

// MARK: - Analytics

struct AdminAnalyticsView: View {
    @State private var rows: [AnalyticsUser] = []
    @State private var leaders: [LeaderRow] = []

    var body: some View {
        List {
            Section("Лидерборд (7 дней, отправлено)") {
                if leaders.isEmpty {
                    Text("Нет данных").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(leaders) { l in
                    HStack {
                        Text(l.email).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text("\(l.sent)").font(.subheadline).fontWeight(.semibold)
                    }
                }
            }

            Section("По пользователям") {
                ForEach(rows) { u in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(u.name).font(.subheadline).fontWeight(.medium)
                            Spacer()
                            if let days = u.inactiveDays {
                                Text("неактивен \(days) дн.")
                                    .font(.caption2).foregroundStyle(days > 3 ? .red : .secondary)
                            }
                        }
                        HStack(spacing: 12) {
                            stat("отправлено", u.sent)
                            stat("удалено", u.deleted)
                            stat("AI ответов", u.aiReply)
                        }
                        if let avg = u.avgResponseHours {
                            Text("Среднее время ответа: \(avg, specifier: "%.1f") ч")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle("Аналитика")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func stat(_ label: String, _ v: Int) -> some View {
        VStack(spacing: 0) {
            Text("\(v)").font(.caption).fontWeight(.semibold)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        rows = (try? await APIClient.shared.request("GET", "/admin/analytics", as: [AnalyticsUser].self)) ?? []
        leaders = (try? await APIClient.shared.request("GET", "/admin/analytics/leaderboard", as: [LeaderRow].self)) ?? []
    }
}

struct AnalyticsUser: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String
    let role: String
    let inactiveDays: Int?
    let sessionCount: Int
    let totalSessionHours: Double
    let sent: Int
    let deleted: Int
    let aiReply: Int
    let avgResponseHours: Double?
}

struct LeaderRow: Codable, Identifiable, Hashable {
    let userId: String
    let email: String
    let sent: Int
    var id: String { userId }
}
