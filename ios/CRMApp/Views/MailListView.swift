import SwiftUI

struct MailListView: View {
    @State private var messages: [MailMessage] = []
    @State private var mailboxes: [Mailbox] = []
    @State private var isLoading = false
    @State private var searchText = ""
    @State private var selectedMailbox = ""
    @State private var selectedFolder = "inbox" // inbox, sent, drafts, trash, starred
    @State private var showCompose = false
    @State private var replyMessage: MailMessage?

    private let folders = [
        ("inbox", "tray.fill"),
        ("sent", "paperplane.fill"),
        ("drafts", "doc.text"),
        ("starred", "star.fill"),
        ("trash", "trash"),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Folder tabs
                HStack(spacing: 0) {
                    ForEach(folders, id: \.0) { f in
                        Button {
                            selectedFolder = f.0
                            Task { await loadMessages() }
                        } label: {
                            Image(systemName: selectedFolder == f.0 ? f.1 : f.1.replacingOccurrences(of: ".fill", with: ""))
                                .font(.system(size: 20))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .foregroundStyle(selectedFolder == f.0 ? .accentColor : .secondary)
                        }
                    }
                }
                .overlay(alignment: .bottom) { Divider() }

                List {
                    ForEach(messages) { msg in
                        NavigationLink(value: msg) {
                            MailRow(message: msg)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await deleteMessage(msg.id) }
                            } label: { Label("Удалить", systemImage: "trash") }
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                Task { await toggleStar(msg) }
                            } label: {
                                Label(msg.isStarred ? "Снять" : "Важное", systemImage: msg.isStarred ? "star.slash" : "star.fill")
                            }
                            .tint(.yellow)
                            Button {
                                Task { await toggleRead(msg) }
                            } label: {
                                Label(msg.isRead ? "Непрочитано" : "Прочитано", systemImage: msg.isRead ? "envelope.badge" : "envelope.open")
                            }
                            .tint(.blue)
                        }
                    }
                    if messages.isEmpty && !isLoading {
                        ContentUnavailableView(
                            "Нет писем",
                            systemImage: "envelope",
                            description: Text("Потяните вниз чтобы обновить")
                        )
                        .listRowBackground(Color.clear)
                    }
                }
                .overlay {
                    if isLoading && messages.isEmpty { ProgressView() }
                }
            }
            .refreshable { await loadMessages() }
            .searchable(text: $searchText, prompt: "Поиск...")
            .onSubmit(of: .search) { Task { await loadMessages() } }
            .navigationDestination(for: MailMessage.self) { msg in
                MailDetailView(message: msg, onReply: { replyMessage = msg })
            }
            .navigationTitle("Почта")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if mailboxes.count > 1 {
                        Menu {
                            Button("Все ящики") {
                                selectedMailbox = ""
                                Task { await loadMessages() }
                            }
                            ForEach(mailboxes) { mb in
                                Button(mb.displayName) {
                                    selectedMailbox = mb.id
                                    Task { await loadMessages() }
                                }
                            }
                        } label: {
                            Image(systemName: "tray.2")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCompose = true } label: {
                        Image(systemName: "square.and.pencil")
                    }
                }
            }
            .sheet(isPresented: $showCompose) {
                ComposeView()
                    .onDisappear { Task { await loadMessages() } }
            }
            .sheet(item: $replyMessage) { msg in
                ComposeView(replyTo: msg)
                    .onDisappear { Task { await loadMessages() } }
            }
            .task {
                mailboxes = (try? await APIClient.shared.request("GET", "/mailboxes", as: [Mailbox].self)) ?? []
                await loadMessages()
            }
        }
    }

    private func loadMessages() async {
        isLoading = true
        defer { isLoading = false }
        var params: [String] = ["limit=50"]
        if !searchText.isEmpty { params.append("q=\(searchText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") }
        if !selectedMailbox.isEmpty { params.append("mailboxId=\(selectedMailbox)") }

        switch selectedFolder {
        case "sent": params.append("folderId=__sent")
        case "drafts": params.append("folderId=__drafts")
        case "trash": params.append("trash=true")
        case "starred": params.append("folderId=__starred")
        default: break
        }

        let path = "/messages?\(params.joined(separator: "&"))"
        var list = (try? await APIClient.shared.request("GET", path, as: [MailMessage].self)) ?? []
        if selectedFolder == "starred" { list = list.filter { $0.isStarred } }
        messages = list
    }

    private func deleteMessage(_ id: String) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/messages/\(id)")
        messages.removeAll { $0.id == id }
    }

    private func toggleStar(_ msg: MailMessage) async {
        _ = try? await APIClient.shared.request("PATCH", "/messages/\(msg.id)",
            body: ["isStarred": !msg.isStarred] as [String: Bool], as: MailMessage.self)
        await loadMessages()
    }

    private func toggleRead(_ msg: MailMessage) async {
        _ = try? await APIClient.shared.request("PATCH", "/messages/\(msg.id)",
            body: ["isRead": !msg.isRead] as [String: Bool], as: MailMessage.self)
        await loadMessages()
    }
}

struct MailRow: View {
    let message: MailMessage

    private var senderName: String {
        let addr = message.fromAddr
        if let atIdx = addr.firstIndex(of: "@") {
            return String(addr[addr.startIndex..<atIdx])
        }
        return addr
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .topTrailing) {
                AvatarView(name: senderName, size: 44)
                if !message.isRead {
                    Circle().fill(.blue)
                        .frame(width: 10, height: 10)
                        .offset(x: 2, y: -2)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(message.fromAddr)
                        .font(.subheadline)
                        .fontWeight(message.isRead ? .regular : .bold)
                        .lineLimit(1)
                    Spacer()
                    HStack(spacing: 4) {
                        if (message._count?.attachments ?? 0) > 0 {
                            Image(systemName: "paperclip")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        if message.isStarred {
                            Image(systemName: "star.fill")
                                .font(.caption2).foregroundStyle(.yellow)
                        }
                        if let d = message.receivedAt {
                            Text(formatDate(d))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Text(message.subject.isEmpty ? "(без темы)" : message.subject)
                    .font(.subheadline)
                    .fontWeight(message.isRead ? .regular : .semibold)
                    .lineLimit(1)
                if let body = message.bodyText, !body.isEmpty {
                    Text(body.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).prefix(100))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func formatDate(_ d: Date) -> String {
        if Calendar.current.isDateInToday(d) {
            return d.formatted(date: .omitted, time: .shortened)
        }
        return d.formatted(date: .abbreviated, time: .omitted)
    }
}

struct MailDetailView: View {
    let message: MailMessage
    var onReply: (() -> Void)?
    @State private var fullMessage: MailMessage?

    var body: some View {
        let msg = fullMessage ?? message
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(msg.subject.isEmpty ? "(без темы)" : msg.subject)
                    .font(.title2).bold()
                HStack {
                    Text("От: \(msg.fromAddr)")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    if let d = msg.receivedAt {
                        Text(d.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if !msg.toAddrs.isEmpty {
                    Text("Кому: \(msg.toAddrs.joined(separator: ", "))")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if !msg.ccAddrs.isEmpty {
                    Text("Копия: \(msg.ccAddrs.joined(separator: ", "))")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Divider()
                if let ai = msg.aiSummary, !ai.isEmpty {
                    HStack(alignment: .top) {
                        Image(systemName: "sparkles")
                        Text(ai)
                    }
                    .font(.callout)
                    .padding(10)
                    .background(Color.accentColor.opacity(0.1))
                    .cornerRadius(8)
                }
                // Attachments
                if let atts = fullMessage?.attachments, !atts.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Вложения (\(atts.count))").font(.caption).foregroundStyle(.secondary)
                        ForEach(atts) { att in
                            Link(destination: URL(string: "https://crm.eg.je/attachments/\(att.id)")!) {
                                HStack {
                                    Image(systemName: att.mime.contains("pdf") ? "doc.fill" : att.mime.contains("image") ? "photo" : "paperclip")
                                    Text(att.filename).lineLimit(1)
                                    Spacer()
                                    Text(formatSize(att.size))
                                        .foregroundStyle(.secondary)
                                }
                                .font(.caption)
                                .padding(8)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(6)
                            }
                        }
                    }
                }

                Text(msg.bodyText ?? "")
                    .font(.body)
                    .textSelection(.enabled)
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            // Gmail-style action bar at bottom
            HStack(spacing: 0) {
                if let onReply {
                    Button { onReply() } label: {
                        VStack(spacing: 2) {
                            Image(systemName: "arrowshape.turn.up.left.fill")
                            Text("Ответить").font(.caption2)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                ShareLink(item: "От: \(msg.fromAddr)\nТема: \(msg.subject)\n\n\(msg.bodyText ?? "")") {
                    VStack(spacing: 2) {
                        Image(systemName: "arrowshape.turn.up.right.fill")
                        Text("Переслать").font(.caption2)
                    }
                    .frame(maxWidth: .infinity)
                }
                Button {
                    Task {
                        _ = try? await APIClient.shared.requestVoid("DELETE", "/messages/\(msg.id)")
                    }
                } label: {
                    VStack(spacing: 2) {
                        Image(systemName: "trash.fill")
                        Text("Удалить").font(.caption2)
                    }
                    .frame(maxWidth: .infinity)
                }
                Menu {
                    Button { Task {
                        _ = try? await APIClient.shared.request("PATCH", "/messages/\(msg.id)", body: ["isStarred": !msg.isStarred] as [String: Bool], as: MailMessage.self)
                    } } label: { Label(msg.isStarred ? "Снять звезду" : "Важное", systemImage: "star") }
                    Button { Task {
                        _ = try? await APIClient.shared.request("PATCH", "/messages/\(msg.id)", body: ["isRead": false] as [String: Bool], as: MailMessage.self)
                    } } label: { Label("Непрочитанное", systemImage: "envelope.badge") }
                } label: {
                    VStack(spacing: 2) {
                        Image(systemName: "ellipsis")
                        Text("Ещё").font(.caption2)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .font(.system(size: 16))
            .foregroundStyle(.secondary)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
        }
        .navigationTitle("Письмо")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadFull() }
    }

    private func loadFull() async {
        // Load full message with attachments
        fullMessage = try? await APIClient.shared.request("GET", "/messages/\(message.id)", as: MailMessage.self)
    }

    private func formatSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) Б" }
        if bytes < 1024 * 1024 { return "\(bytes / 1024) КБ" }
        return String(format: "%.1f МБ", Double(bytes) / 1024 / 1024)
    }
}
