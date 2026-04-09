import SwiftUI

struct TaskDetailView: View {
    let task: CRMTask
    @State private var working = false
    @State private var currentStatus: String

    init(task: CRMTask) {
        self.task = task
        _currentStatus = State(initialValue: task.status)
    }

    var body: some View {
        Form {
            Section {
                Text(task.title).font(.title3).bold()
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
                LabeledContent("Приоритет", value: task.priority)
                if let p = task.project?.name { LabeledContent("Проект", value: p) }
                if let d = task.dueDate {
                    LabeledContent("Дедлайн", value: d.formatted(date: .long, time: .omitted))
                }
                LabeledContent("Создана", value: task.createdAt.formatted(date: .abbreviated, time: .shortened))
            }

            if let comments = task.comments, !comments.isEmpty {
                Section("Комментарии") {
                    ForEach(comments) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.text).font(.body)
                            Text(c.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Задача")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if working { ProgressView() }
        }
    }
}
