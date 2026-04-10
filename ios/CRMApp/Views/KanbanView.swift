import SwiftUI

struct KanbanView: View {
    @State private var tasks: [CRMTask] = []
    @State private var isLoading = false
    @State private var selectedColumn = 0

    private let columns: [(key: String, title: String, icon: String, color: Color)] = [
        ("open", "Открыта", "tray", .blue),
        ("in_progress", "В работе", "gearshape", .orange),
        ("done", "Выполнена", "checkmark.circle", .green),
        ("cancelled", "Отменена", "xmark.circle", .gray),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Column picker
            HStack(spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.offset) { idx, col in
                    let count = tasks.filter { $0.status == col.key }.count
                    Button {
                        withAnimation { selectedColumn = idx }
                    } label: {
                        VStack(spacing: 4) {
                            HStack(spacing: 4) {
                                Image(systemName: col.icon)
                                    .font(.system(size: 14))
                                if count > 0 {
                                    Text("\(count)")
                                        .font(.system(size: 12, weight: .medium, design: .rounded))
                                }
                            }
                            .foregroundStyle(selectedColumn == idx ? col.color : .secondary)

                            Rectangle()
                                .fill(selectedColumn == idx ? col.color : .clear)
                                .frame(height: 2)
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .background(Color(.secondarySystemBackground))

            // Swipeable pages
            TabView(selection: $selectedColumn) {
                ForEach(Array(columns.enumerated()), id: \.offset) { idx, col in
                    let items = tasks.filter { $0.status == col.key }
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            if items.isEmpty {
                                VStack(spacing: 12) {
                                    Image(systemName: col.icon)
                                        .font(.system(size: 40))
                                        .foregroundStyle(.tertiary)
                                    Text("Пусто")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
                            }
                            ForEach(items) { task in
                                kanbanCard(task, column: col)
                            }
                        }
                        .padding()
                    }
                    .tag(idx)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
        .overlay {
            if isLoading && tasks.isEmpty { ProgressView() }
        }
        .task { await load() }
    }

    private func kanbanCard(_ task: CRMTask, column: (key: String, title: String, icon: String, color: Color)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                PriorityDot(priority: task.priority)
                    .frame(width: 16)
                Text(task.title)
                    .font(.subheadline).fontWeight(.medium)
                Spacer()
            }

            HStack(spacing: 8) {
                if let p = task.project?.name {
                    Label(p, systemImage: "folder")
                        .font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let d = task.dueDate {
                    let overdue = d < Date() && task.status != "done"
                    Label(d.formatted(date: .abbreviated, time: .omitted),
                          systemImage: overdue ? "clock.badge.exclamationmark" : "calendar")
                        .font(.caption)
                        .foregroundStyle(overdue ? .red : .secondary)
                }
                if let cat = task.category, !cat.isEmpty {
                    LabelPill(text: cat)
                }
            }

            // Move actions
            HStack(spacing: 8) {
                ForEach(columns.filter { $0.key != column.key }, id: \.key) { target in
                    Button {
                        Task { await move(task, to: target.key) }
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: target.icon)
                                .font(.system(size: 10))
                            Text(target.title)
                                .font(.system(size: 10))
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(target.color.opacity(0.1))
                        .foregroundStyle(target.color)
                        .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(14)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
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
