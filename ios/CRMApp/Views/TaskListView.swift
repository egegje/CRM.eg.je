import SwiftUI

struct TaskListView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var store = TasksStore()
    @State private var filter: TasksStore.Filter = .mine

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.tasks) { task in
                    NavigationLink(value: task) {
                        TaskRow(task: task)
                    }
                }
                if store.tasks.isEmpty && !store.isLoading {
                    ContentUnavailableView(
                        "Пусто",
                        systemImage: "tray",
                        description: Text("В этом разделе задач нет")
                    )
                    .listRowBackground(Color.clear)
                }
            }
            .overlay {
                if store.isLoading && store.tasks.isEmpty {
                    ProgressView()
                }
            }
            .refreshable { await load() }
            .navigationDestination(for: CRMTask.self) { TaskDetailView(task: $0) }
            .navigationTitle(filter.title)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ForEach(TasksStore.Filter.allCases) { f in
                            Button {
                                filter = f
                                Task { await load() }
                            } label: {
                                Label(f.title, systemImage: f.systemImage)
                            }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .task(id: filter) { await load() }
            .alert("Ошибка", isPresented: .constant(store.errorMessage != nil), actions: {
                Button("OK") { store.errorMessage = nil }
            }, message: {
                Text(store.errorMessage ?? "")
            })
        }
    }

    private func load() async {
        await store.load(filter: filter, currentUserId: auth.user?.id)
    }
}

struct TaskRow: View {
    let task: CRMTask

    private var overdue: Bool {
        if let d = task.dueDate, task.status != "done" { return d < Date() }
        return false
    }

    var body: some View {
        HStack(spacing: 10) {
            priorityIcon
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.body)
                    .strikethrough(task.status == "done")
                    .foregroundStyle(task.status == "done" ? .secondary : .primary)
                HStack(spacing: 6) {
                    if let p = task.project?.name {
                        Label(p, systemImage: "folder").labelStyle(.titleAndIcon)
                    }
                    if let d = task.dueDate {
                        Label(d.formatted(date: .abbreviated, time: .omitted),
                              systemImage: overdue ? "clock.badge.exclamationmark" : "calendar")
                            .foregroundStyle(overdue ? .red : .secondary)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var priorityIcon: some View {
        switch task.priority {
        case "urgent": Image(systemName: "flame.fill").foregroundStyle(.red)
        case "high": Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        default: Image(systemName: "circle").foregroundStyle(.secondary)
        }
    }
}
