import SwiftUI

struct TeamView: View {
    @State private var members: [TeamMemberStats] = []
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            if isLoading && members.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            } else if members.isEmpty {
                ContentUnavailableView(
                    "Нет данных",
                    systemImage: "person.3",
                    description: Text("Доступно для admin и owner")
                )
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                    ForEach(members) { m in
                        teamCard(m)
                    }
                }
                .padding()
            }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func teamCard(_ m: TeamMemberStats) -> some View {
        let accent: Color = m.overdue >= 5 ? .red : m.overdue >= 1 ? .orange : .green

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(m.name).font(.headline).lineLimit(1)
                Spacer()
                Circle().fill(accent).frame(width: 10, height: 10)
            }
            Text(m.email).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Text(m.role).font(.caption2).foregroundStyle(.secondary)

            Divider()

            HStack(spacing: 12) {
                statBlock(value: m.open, label: "откр.", color: .primary)
                statBlock(value: m.overdue, label: "проср.", color: .red)
                statBlock(value: m.doneWeek, label: "за нед.", color: .green)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func statBlock(value: Int, label: String, color: Color) -> some View {
        VStack(spacing: 1) {
            Text("\(value)")
                .font(.title2).bold()
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        members = (try? await APIClient.shared.request("GET", "/tasks/team-stats", as: [TeamMemberStats].self)) ?? []
    }
}
