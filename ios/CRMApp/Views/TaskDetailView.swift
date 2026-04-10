import SwiftUI

struct TaskDetailView: View {
    let task: CRMTask
    var onEdit: (() -> Void)?
    @State private var working = false
    @State private var currentStatus: String
    @State private var newComment = ""
    @State private var comments: [TaskComment]

    init(task: CRMTask, onEdit: (() -> Void)? = nil) {
        self.task = task
        self.onEdit = onEdit
        _currentStatus = State(initialValue: task.status)
        _comments = State(initialValue: task.comments ?? [])
    }

    var body: some View {
        Form {
            Section {
                Text(task.title).font(.body).fontWeight(.medium)
                if let d = task.description, !d.isEmpty {
                    Text(d).foregroundStyle(.secondary)
                }
            }

            Section("Статус") {
                Picker("Статус", selection: $currentStatus) {
                    Text("Открыта").tag("open")
                    Text("В работе").tag("in_progress")
                    Text("Выполнена").tag("done")
                    Text("Отменена").tag("cancelled")
                }
                .pickerStyle(.segmented)
                .onChange(of: currentStatus) { _, new in
                    Task {
                        working = true
                        await TasksStore().patch(task.id, body: ["status": new])
                        working = false
                    }
                }
            }

            Section("Мета") {
                LabeledContent("Приоритет", value: priorityLabel)
                if let p = task.project?.name { LabeledContent("Проект", value: p) }
                if let d = task.dueDate {
                    LabeledContent("Дедлайн", value: d.formatted(date: .long, time: .omitted))
                }
                if let cat = task.category, !cat.isEmpty {
                    LabeledContent("Метка", value: cat)
                }
                LabeledContent("Создана", value: task.createdAt.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Комментарии (\(comments.count))") {
                ForEach(comments) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.text).font(.body)
                        Text(c.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                HStack {
                    TextField("Комментарий...", text: $newComment)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        Task { await sendComment() }
                    } label: {
                        Image(systemName: "paperplane").font(.system(size: 16, weight: .light))
                    }
                    .disabled(newComment.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .navigationTitle("Задача")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let onEdit {
                    Button { onEdit() } label: { Image(systemName: "pencil").font(.system(size: 16, weight: .light)) }
                }
            }
        }
        .overlay {
            if working { ProgressView() }
        }
    }

    private var priorityLabel: String {
        switch task.priority {
        case "urgent": return "🔥 срочный"
        case "high": return "⚠️ высокий"
        case "low": return "низкий"
        default: return "обычный"
        }
    }

    private func sendComment() async {
        let text = newComment.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        guard let body = try? JSONSerialization.data(withJSONObject: ["text": text]) else { return }
        var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(task.id)/comments")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let session = await APIClient.urlSession
        if let (respData, _) = try? await session.data(for: req) {
            if let comment = try? JSONDecoder().decode(TaskComment.self, from: respData) {
                comments.append(comment)
                newComment = ""
            }
        }
    }
}
