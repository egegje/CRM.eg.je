import SwiftUI

struct TaskListView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var store = TasksStore()
    @State private var filter: TasksStore.Filter = .mine
    @State private var showCreateForm = false
    @State private var editingTask: CRMTask?
    @State private var showKanban = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.tasks) { task in
                    NavigationLink(value: task) {
                        TaskRow(task: task)
                    }
                    .swipeActions(edge: .trailing) {
                        if task.status != "done" {
                            Button {
                                Task { await complete(task) }
                            } label: {
                                Label("Завершить", systemImage: "checkmark.circle")
                            }
                            .tint(.green)
                        }
                        Button(role: .destructive) {
                            Task { await delete(task) }
                        } label: {
                            Label("Удалить", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            editingTask = task
                        } label: {
                            Label("Изменить", systemImage: "pencil")
                        }
                        .tint(.blue)
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
            .listStyle(.plain)
            .overlay {
                if store.isLoading && store.tasks.isEmpty {
                    ProgressView()
                }
            }
            .refreshable { await load() }
            .navigationDestination(for: CRMTask.self) { task in
                TaskDetailView(task: task, onEdit: { editingTask = task })
            }
            .navigationTitle(filter.title)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
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
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Button {
                            showKanban = true
                        } label: {
                            Image(systemName: "rectangle.split.3x1")
                        }
                        Button {
                            showCreateForm = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showCreateForm) {
                TaskFormView()
                    .environmentObject(auth)
                    .onDisappear { Task { await load() } }
            }
            .sheet(item: $editingTask) { task in
                TaskFormView(editTask: task)
                    .environmentObject(auth)
                    .onDisappear { Task { await load() } }
            }
            .sheet(isPresented: $showKanban) {
                NavigationStack {
                    KanbanView()
                        .navigationTitle("Канбан")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Закрыть") { showKanban = false }
                            }
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

    private func complete(_ task: CRMTask) async {
        await store.patch(task.id, body: ["status": "done"])
        await load()
    }

    private func delete(_ task: CRMTask) async {
        _ = try? await APIClient.shared.requestVoid("DELETE", "/tasks/\(task.id)")
        await load()
    }
}

struct TaskRow: View {
    let task: CRMTask

    private var overdue: Bool {
        if let d = task.dueDate, task.status != "done" { return d < Date() }
        return false
    }

    var body: some View {
        HStack(spacing: 12) {
            PriorityDot(priority: task.priority)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 5) {
                Text(task.title)
                    .font(.body)
                    .strikethrough(task.status == "done")
                    .foregroundStyle(task.status == "done" ? .secondary : .primary)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    StatusPill(status: task.status)
                    if let p = task.project?.name {
                        Label(p, systemImage: "folder")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let d = task.dueDate {
                        Label(d.formatted(date: .abbreviated, time: .omitted),
                              systemImage: overdue ? "clock.badge.exclamationmark" : "calendar")
                            .font(.caption2)
                            .foregroundStyle(overdue ? .red : .secondary)
                    }
                    if let cat = task.category, !cat.isEmpty {
                        LabelPill(text: cat)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

}
