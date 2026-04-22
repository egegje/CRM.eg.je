import SwiftUI

struct TaskFormView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var auth: AuthStore

    var editTask: CRMTask?

    @State private var title = ""
    @State private var description = ""
    @State private var assigneeId = ""
    @State private var projectId = ""
    @State private var dueDate = Date()
    @State private var hasDueDate = false
    @State private var priority = "normal"
    @State private var status = "open"
    @State private var category = ""
    @State private var busy = false
    @State private var errorMsg: String?

    @State private var users: [User] = []
    @State private var projects: [Project] = []
    @State private var allTags: [TaskTag] = []
    @State private var selectedTagIds: Set<String> = []
    @State private var initialTagIds: Set<String> = []
    @State private var showNewTag = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Основное") {
                    TextField("Заголовок", text: $title)
                    TextField("Описание", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Назначение") {
                    Picker("Исполнитель", selection: $assigneeId) {
                        Text("—").tag("")
                        ForEach(users) { u in
                            Text(u.name).tag(u.id)
                        }
                    }
                    Picker("Проект", selection: $projectId) {
                        Text("—").tag("")
                        ForEach(projects) { p in
                            Text(p.name).tag(p.id)
                        }
                    }
                }

                Section("Параметры") {
                    Picker("Приоритет", selection: $priority) {
                        Text("низкий").tag("low")
                        Text("обычный").tag("normal")
                        Text("высокий").tag("high")
                        Text("срочный").tag("urgent")
                    }
                    if editTask != nil {
                        Picker("Статус", selection: $status) {
                            Text("открыта").tag("open")
                            Text("в работе").tag("in_progress")
                            Text("на проверке").tag("awaiting_review")
                            Text("выполнена").tag("done")
                            Text("отменена").tag("cancelled")
                        }
                    }
                    Toggle("Дедлайн", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Дата", selection: $dueDate, displayedComponents: [.date])
                    }
                    TextField("Категория", text: $category)
                }

                Section {
                    if allTags.isEmpty {
                        Text("Нет тегов")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        TagsGrid(tags: allTags, selected: $selectedTagIds)
                    }
                    Button {
                        showNewTag = true
                    } label: {
                        Label("Новый тег", systemImage: "plus.circle")
                            .font(.caption)
                    }
                } header: {
                    Text("Теги")
                }

                if let err = errorMsg {
                    Section {
                        Text(err).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle(editTask == nil ? "Новая задача" : "Редактировать")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editTask == nil ? "Создать" : "Сохранить") {
                        Task { await save() }
                    }
                    .disabled(title.isEmpty || busy)
                    .fontWeight(.semibold)
                }
            }
            .sheet(isPresented: $showNewTag) {
                NewTagSheet { newTag in
                    allTags.append(newTag)
                    selectedTagIds.insert(newTag.id)
                }
            }
            .task { await loadOptions() }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let t = editTask else { return }
        title = t.title
        description = t.description ?? ""
        assigneeId = t.assigneeId ?? ""
        projectId = t.projectId ?? ""
        priority = t.priority
        status = t.status
        category = t.category ?? ""
        if let d = t.dueDate {
            dueDate = d
            hasDueDate = true
        }
        if let assigns = t.tagAssignments {
            let ids = Set(assigns.map { $0.tagId })
            selectedTagIds = ids
            initialTagIds = ids
        }
    }

    private func loadOptions() async {
        users = (try? await APIClient.shared.request("GET", "/admin/users", as: [User].self)) ?? []
        projects = (try? await APIClient.shared.request("GET", "/projects", as: [Project].self)) ?? []
        allTags = (try? await APIClient.shared.request("GET", "/tags", as: [TaskTag].self)) ?? []
    }

    private func save() async {
        busy = true
        errorMsg = nil
        defer { busy = false }

        var body: [String: Any] = ["title": title, "priority": priority]
        if !description.isEmpty { body["description"] = description }
        if !assigneeId.isEmpty { body["assigneeId"] = assigneeId }
        if !projectId.isEmpty { body["projectId"] = projectId }
        if !category.isEmpty { body["category"] = category }
        if hasDueDate {
            let fmt = ISO8601DateFormatter()
            body["dueDate"] = fmt.string(from: dueDate)
        }

        do {
            let taskId: String?
            if let t = editTask {
                body["status"] = status
                let patchData = try? JSONSerialization.data(withJSONObject: body)
                var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(t.id)")!)
                req.httpMethod = "PATCH"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = patchData
                let s = await APIClient.urlSession
                _ = try await s.data(for: req)
                taskId = t.id
            } else {
                let jsonData = try JSONSerialization.data(withJSONObject: body)
                var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = jsonData
                let s = await APIClient.urlSession
                let (data, _) = try await s.data(for: req)
                let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                taskId = obj?["id"] as? String
            }

            if let id = taskId {
                let toAdd = selectedTagIds.subtracting(initialTagIds)
                let toRemove = initialTagIds.subtracting(selectedTagIds)
                for tid in toAdd {
                    let data = try? JSONSerialization.data(withJSONObject: ["tagId": tid])
                    var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(id)/tags")!)
                    req.httpMethod = "POST"
                    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    req.httpBody = data
                    let s = await APIClient.urlSession
                    _ = try? await s.data(for: req)
                }
                for tid in toRemove {
                    var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(id)/tags/\(tid)")!)
                    req.httpMethod = "DELETE"
                    let s = await APIClient.urlSession
                    _ = try? await s.data(for: req)
                }
            }

            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

/// Wrap-flow grid of selectable tag chips.
struct TagsGrid: View {
    let tags: [TaskTag]
    @Binding var selected: Set<String>

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags) { tag in
                let isOn = selected.contains(tag.id)
                let col = Color(hex: tag.color) ?? .accentColor
                Button {
                    if isOn { selected.remove(tag.id) } else { selected.insert(tag.id) }
                } label: {
                    Text(tag.name)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(isOn ? col.opacity(0.2) : Color(.tertiarySystemBackground))
                        .foregroundStyle(isOn ? col : Color.secondary)
                        .overlay(
                            Capsule().stroke(isOn ? col : Color.clear, lineWidth: 1)
                        )
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct NewTagSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onCreated: (TaskTag) -> Void
    @State private var name = ""
    @State private var color = "#6b7280"
    @State private var busy = false

    private let palette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"]

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Название", text: $name) }
                Section("Цвет") {
                    HStack {
                        ForEach(palette, id: \.self) { c in
                            let col = Color(hex: c) ?? .gray
                            Circle()
                                .fill(col)
                                .frame(width: 28, height: 28)
                                .overlay(
                                    Circle().stroke(c == color ? Color.primary : Color.clear, lineWidth: 2)
                                )
                                .onTapGesture { color = c }
                        }
                    }
                }
            }
            .navigationTitle("Новый тег")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await create() } }
                        .disabled(name.isEmpty || busy)
                }
            }
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let data = try JSONSerialization.data(withJSONObject: ["name": name, "color": color])
            var req = URLRequest(url: URL(string: "https://crm.eg.je/tags")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = data
            let s = await APIClient.urlSession
            let (respData, _) = try await s.data(for: req)
            if let tag = try? JSONDecoder().decode(TaskTag.self, from: respData) {
                onCreated(tag)
                dismiss()
            }
        } catch {}
    }
}

extension Color {
    init?(hex: String) {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self = Color(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}

/// Simple wrap layout (iOS 16+).
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        for v in subviews {
            let sz = v.sizeThatFits(.unspecified)
            if x + sz.width > maxW && x > 0 {
                y += rowH + spacing
                x = 0
                rowH = 0
            }
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
        return CGSize(width: maxW == .infinity ? x : maxW, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxW = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowH: CGFloat = 0
        for v in subviews {
            let sz = v.sizeThatFits(.unspecified)
            if x + sz.width > bounds.minX + maxW && x > bounds.minX {
                y += rowH + spacing
                x = bounds.minX
                rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
    }
}
