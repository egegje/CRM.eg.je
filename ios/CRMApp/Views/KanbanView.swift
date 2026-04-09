import SwiftUI

struct KanbanView: View {
    @State private var tasks: [CRMTask] = []
    @State private var isLoading = false

    private let columns: [(key: String, title: String, color: Color)] = [
        ("open", "Открыта", .blue),
        ("in_progress", "В работе", .orange),
        ("done", "Выполнена", .green),
        ("cancelled", "Отменена", .gray),
    ]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(columns, id: \.key) { col in
                    kanbanColumn(col)
                }
            }
            .padding()
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func kanbanColumn(_ col: (key: String, title: String, color: Color)) -> some View {
        let items = tasks.filter { $0.status == col.key }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle().fill(col.color).frame(width: 8, height: 8)
                Text(col.title).font(.subheadline).bold()
                Text("· \(items.count)").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)

            ForEach(items) { task in
                kanbanCard(task)
            }

            if items.isEmpty {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.tertiarySystemBackground))
                    .frame(height: 60)
                    .overlay {
                        Text("пусто").font(.caption).foregroundStyle(.secondary)
                    }
            }
        }
        .frame(width: 200)
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func kanbanCard(_ task: CRMTask) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(task.title)
                .font(.subheadline).fontWeight(.semibold)
                .lineLimit(2)
            if let p = task.project?.name {
                Label(p, systemImage: "folder")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if let d = task.dueDate {
                let overdue = d < Date() && task.status != "done"
                Label(d.formatted(date: .abbreviated, time: .omitted), systemImage: overdue ? "clock.badge.exclamationmark" : "calendar")
                    .font(.caption2)
                    .foregroundStyle(overdue ? .red : .secondary)
            }
            HStack {
                priorityBadge(task.priority)
                Spacer()
                Menu {
                    Button("Открыта") { Task { await move(task, to: "open") } }
                    Button("В работе") { Task { await move(task, to: "in_progress") } }
                    Button("Выполнена") { Task { await move(task, to: "done") } }
                    Button("Отменена") { Task { await move(task, to: "cancelled") } }
                } label: {
                    Image(systemName: "arrow.right.circle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color(.systemBackground))
        .cornerRadius(8)
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    @ViewBuilder
    private func priorityBadge(_ p: String) -> some View {
        switch p {
        case "urgent":
            Label("срочно", systemImage: "flame.fill")
                .font(.caption2).foregroundStyle(.red)
        case "high":
            Label("высокий", systemImage: "exclamationmark.triangle.fill")
                .font(.caption2).foregroundStyle(.orange)
        default:
            EmptyView()
        }
    }

    private func move(_ task: CRMTask, to status: String) async {
        await TasksStore().patch(task.id, body: ["status": status])
        await load()
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        tasks = (try? await APIClient.shared.request("GET", "/tasks?limit=500&status=all", as: [CRMTask].self)) ?? []
    }
}
