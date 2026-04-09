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
                            Text("выполнена").tag("done")
                            Text("отменена").tag("cancelled")
                        }
                    }
                    Toggle("Дедлайн", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Дата", selection: $dueDate, displayedComponents: [.date])
                    }
                    TextField("Метка", text: $category)
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
                    .bold()
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
    }

    private func loadOptions() async {
        users = (try? await APIClient.shared.request("GET", "/admin/users", as: [User].self)) ?? []
        projects = (try? await APIClient.shared.request("GET", "/projects", as: [Project].self)) ?? []
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

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else { return }

        do {
            if let t = editTask {
                body["status"] = status
                let patchData = try? JSONSerialization.data(withJSONObject: body)
                var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(t.id)")!)
                req.httpMethod = "PATCH"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = patchData
                _ = try await URLSession.shared.data(for: req)
            } else {
                var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = jsonData
                _ = try await URLSession.shared.data(for: req)
            }
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}
