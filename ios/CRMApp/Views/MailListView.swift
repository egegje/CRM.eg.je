import SwiftUI

struct MailListView: View {
    @State private var messages: [MailMessage] = []
    @State private var isLoading = false
    @State private var selectedMessage: MailMessage?
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(messages) { msg in
                    NavigationLink(value: msg) {
                        MailRow(message: msg)
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
            .refreshable { await loadMessages() }
            .searchable(text: $searchText, prompt: "Поиск...")
            .onSubmit(of: .search) { Task { await loadMessages() } }
            .navigationDestination(for: MailMessage.self) { MailDetailView(message: $0) }
            .navigationTitle("Почта")
            .task { await loadMessages() }
        }
    }

    private func loadMessages() async {
        isLoading = true
        defer { isLoading = false }
        var path = "/messages?limit=50"
        if !searchText.isEmpty { path += "&q=\(searchText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }
        messages = (try? await APIClient.shared.request("GET", path, as: [MailMessage].self)) ?? []
    }
}

struct MailRow: View {
    let message: MailMessage

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(message.isRead ? Color.clear : Color.accentColor)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(message.fromAddr)
                        .font(.subheadline)
                        .fontWeight(message.isRead ? .regular : .bold)
                        .lineLimit(1)
                    Spacer()
                    if let d = message.receivedAt {
                        Text(formatDate(d))
                            .font(.caption)
                            .foregroundStyle(.secondary)
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
            if message.isStarred {
                Image(systemName: "star.fill")
                    .foregroundStyle(.yellow)
                    .font(.caption)
            }
        }
        .padding(.vertical, 2)
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(message.subject.isEmpty ? "(без темы)" : message.subject)
                    .font(.title2).bold()
                HStack {
                    Text("От: \(message.fromAddr)")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    if let d = message.receivedAt {
                        Text(d.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if !message.toAddrs.isEmpty {
                    Text("Кому: \(message.toAddrs.joined(separator: ", "))")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Divider()
                if let ai = message.aiSummary, !ai.isEmpty {
                    HStack {
                        Image(systemName: "sparkles")
                        Text(ai)
                    }
                    .font(.callout)
                    .padding(10)
                    .background(Color.accentColor.opacity(0.1))
                    .cornerRadius(8)
                }
                Text(message.bodyText ?? "")
                    .font(.body)
                    .textSelection(.enabled)
            }
            .padding()
        }
        .navigationTitle("Письмо")
        .navigationBarTitleDisplayMode(.inline)
        .task { await markRead() }
    }

    private func markRead() async {
        if message.isRead { return }
        _ = try? await APIClient.shared.request(
            "PATCH", "/messages/\(message.id)",
            body: ["isRead": true] as [String: Bool],
            as: MailMessage.self
        )
    }
}
