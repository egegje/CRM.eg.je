import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var summary: HomeSummary?
    @State private var briefing: String?
    @State private var loading = true
    @State private var error: String?
    @State private var selectedTab: Binding<Int>?

    var onNavigate: ((Int) -> Void)?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    if let error {
                        errorCard(error)
                    }
                    briefingCard
                    statsRow
                    wideFinanceCard
                    focusSection
                    weeklyCalendar
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarHidden(true)
        }
        .task { await loadAll() }
        .refreshable { await loadAll() }
    }

    // MARK: - Subviews

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dateString().uppercased())
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(Color.secondary)
                Text(greetingString())
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.5)
            }
            Spacer()
            avatarBubble
        }
    }

    private var avatarBubble: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#6366F1"), Color(hex: "#8B5CF6")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text(initials())
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
        .shadow(color: Color(hex: "#6366F1").opacity(0.35), radius: 8, y: 3)
    }

    private var briefingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 12, weight: .semibold))
                Text("Брифинг")
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(1.2)
                    .textCase(.uppercase)
            }
            .foregroundStyle(Color(hex: "#6366F1"))

            if loading && briefing == nil {
                Text("Готовлю сводку…")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.secondary)
            } else {
                Text(briefing ?? "Нет данных.")
                    .font(.system(size: 14))
                    .lineSpacing(4)
                    .foregroundStyle(.primary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(hex: "#EEF2FF"), Color(hex: "#F5F3FF"), Color(hex: "#FDF4FF")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(hex: "#6366F1").opacity(0.2), lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            statCard(
                icon: "envelope",
                tint: Color(hex: "#6366F1"),
                value: "\(summary?.counters.unread ?? 0)",
                label: "непрочитанных",
                onTap: { onNavigate?(1) }
            )
            statCard(
                icon: "checklist",
                tint: Color(hex: "#F59E0B"),
                value: "\(summary?.counters.openTasks ?? 0)",
                label: "открытых задач",
                badge: overdueBadge(),
                onTap: { onNavigate?(0) }
            )
        }
    }

    private func statCard(
        icon: String,
        tint: Color,
        value: String,
        label: String,
        badge: (text: String, color: Color)? = nil,
        onTap: @escaping () -> Void
    ) -> some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10).fill(tint.opacity(0.15))
                        Image(systemName: icon)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 32, height: 32)
                    Spacer()
                    if let badge {
                        Text(badge.text)
                            .font(.system(size: 10, weight: .bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(badge.color.opacity(0.15))
                            .foregroundStyle(badge.color)
                            .clipShape(Capsule())
                    }
                }
                Text(value)
                    .font(.system(size: 24, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(.primary)
                    .padding(.top, 2)
                Text(label)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private var wideFinanceCard: some View {
        Button {
            onNavigate?(2)
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    LinearGradient(
                        colors: [Color(hex: "#10B981"), Color(hex: "#059669")],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    Image(systemName: "creditcard.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 42, height: 42)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: Color(hex: "#10B981").opacity(0.3), radius: 8, y: 3)

                VStack(alignment: .leading, spacing: 2) {
                    Text("СБЕРБАНК · RUB")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(.secondary)
                    Text(formatMoney(summary?.counters.balance ?? 0))
                        .font(.system(size: 20, weight: .bold))
                        .tracking(-0.4)
                        .foregroundStyle(.primary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private var focusSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Фокус на сегодня")
                    .font(.system(size: 17, weight: .bold))
                    .tracking(-0.3)
                Spacer()
                Button("Все →") { onNavigate?(0) }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: "#6366F1"))
            }

            VStack(spacing: 0) {
                let tasks = summary?.urgentTasks.prefix(5) ?? []
                if tasks.isEmpty {
                    Text("Ничего срочного. Можно выдохнуть.")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .italic()
                        .padding(.vertical, 20)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(Array(tasks.enumerated()), id: \.element.id) { idx, t in
                        priorityRow(t)
                        if idx < tasks.count - 1 {
                            Divider().opacity(0.4)
                        }
                    }
                }
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func priorityRow(_ t: HomeSummary.UrgentTask) -> some View {
        let (tagText, tagColor) = tagFor(task: t)
        return HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 9).fill(tagColor.opacity(0.15))
                Image(systemName: iconFor(priority: t.priority, overdue: t.overdue))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tagColor)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(t.title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(subtitleFor(task: t))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)

            Text(tagText)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.4)
                .textCase(.uppercase)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(tagColor.opacity(0.15))
                .foregroundStyle(tagColor)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { onNavigate?(0) }
    }

    private var weeklyCalendar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Календарь недели")
                .font(.system(size: 17, weight: .bold))
                .tracking(-0.3)

            let days = weekDays()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
                ForEach(days, id: \.key) { day in
                    calendarCell(day)
                }
            }
        }
    }

    private func calendarCell(_ d: DayCell) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 3) {
                Text(d.dow)
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(d.isToday ? Color(hex: "#6366F1") : Color.secondary)
                Text("\(d.day)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(d.isToday ? Color(hex: "#6366F1") : .primary)
            }
            ForEach(d.tasks.prefix(2), id: \.id) { t in
                Text(t.title)
                    .font(.system(size: 9, weight: .semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(colorFor(priority: t.priority).opacity(0.12))
                    .foregroundStyle(colorFor(priority: t.priority))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            if d.tasks.count > 2 {
                Text("+\(d.tasks.count - 2)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .frame(minHeight: 88, alignment: .topLeading)
        .background(d.isToday
            ? Color(hex: "#6366F1").opacity(0.08)
            : Color(.secondarySystemGroupedBackground))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(d.isToday ? Color(hex: "#6366F1").opacity(0.5) : Color.clear, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func errorCard(_ msg: String) -> some View {
        Text("Ошибка: \(msg)")
            .font(.system(size: 13))
            .foregroundStyle(Color(hex: "#EF4444"))
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(hex: "#EF4444").opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Data

    private func loadAll() async {
        loading = true
        error = nil
        async let summaryTask: Void = loadSummary()
        async let briefingTask: Void = loadBriefing()
        _ = await (summaryTask, briefingTask)
        loading = false
    }

    private func loadSummary() async {
        do {
            summary = try await APIClient.shared.request("GET", "/home/summary", as: HomeSummary.self)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "\(error)"
        }
    }

    private func loadBriefing() async {
        do {
            let r = try await APIClient.shared.request("GET", "/home/briefing", as: HomeBriefing.self)
            briefing = r.text
        } catch {
            briefing = nil
        }
    }

    // MARK: - Formatting

    private func dateString() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "EEEE, d MMMM"
        return f.string(from: Date())
    }

    private func greetingString() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        let greet: String
        switch h {
        case 5..<12: greet = "Доброе утро"
        case 12..<18: greet = "Добрый день"
        case 18..<23: greet = "Добрый вечер"
        default: greet = "Доброй ночи"
        }
        let raw = auth.user?.name ?? ""
        let name: String
        if !raw.isEmpty {
            name = raw
        } else if let email = auth.user?.email, let local = email.components(separatedBy: "@").first {
            name = String(local)
        } else {
            name = ""
        }
        return name.isEmpty ? "\(greet)." : "\(greet), \(name.capitalized)."
    }

    private func initials() -> String {
        let name = auth.user?.name ?? auth.user?.email ?? "?"
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].first!) + String(parts[1].first!)
        }
        return String(name.prefix(2)).uppercased()
    }

    private func formatMoney(_ v: Double) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return (f.string(from: NSNumber(value: v)) ?? "\(Int(v))") + " ₽"
    }

    private func overdueBadge() -> (text: String, color: Color)? {
        guard let o = summary?.counters.overdueTasks, o > 0 else { return nil }
        return ("\(o) проср.", Color(hex: "#EF4444"))
    }

    private func colorFor(priority: String) -> Color {
        switch priority {
        case "urgent": return Color(hex: "#EF4444")
        case "high": return Color(hex: "#F59E0B")
        default: return Color(hex: "#6366F1")
        }
    }

    private func iconFor(priority: String, overdue: Bool) -> String {
        if overdue { return "flame.fill" }
        switch priority {
        case "urgent": return "exclamationmark.triangle.fill"
        case "high": return "bolt.fill"
        default: return "circle"
        }
    }

    private func tagFor(task: HomeSummary.UrgentTask) -> (String, Color) {
        if task.overdue { return ("Просрочено", Color(hex: "#EF4444")) }
        if task.priority == "urgent" { return ("Срочно", Color(hex: "#EF4444")) }
        if task.priority == "high" { return ("Важно", Color(hex: "#F59E0B")) }
        return ("Задача", Color(hex: "#6366F1"))
    }

    private func subtitleFor(task: HomeSummary.UrgentTask) -> String {
        let project = task.project?.name ?? "Без проекта"
        if let d = task.dueDate {
            let f = DateFormatter()
            f.locale = Locale(identifier: "ru_RU")
            f.dateFormat = "d MMM"
            return "\(project) · \(f.string(from: d))"
        }
        return project
    }

    // MARK: - Week

    private struct DayCell {
        let key: String
        let dow: String
        let day: Int
        let isToday: Bool
        let tasks: [HomeSummary.WeekTask]
    }

    private func weekDays() -> [DayCell] {
        guard let summary else { return [] }
        let iso = DateFormatter()
        iso.dateFormat = "yyyy-MM-dd"
        iso.locale = Locale(identifier: "en_US_POSIX")
        guard let start = iso.date(from: summary.weekStart) else { return [] }
        let cal = Calendar(identifier: .iso8601)
        let today = cal.startOfDay(for: Date())
        let names = ["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"]
        return (0..<7).map { i in
            let d = cal.date(byAdding: .day, value: i, to: start)!
            let key = iso.string(from: d)
            return DayCell(
                key: key,
                dow: names[i],
                day: cal.component(.day, from: d),
                isToday: cal.startOfDay(for: d) == today,
                tasks: summary.week[key] ?? []
            )
        }
    }
}

// MARK: - Color hex helper
extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        let v = UInt32(cleaned, radix: 16) ?? 0
        let r = Double((v >> 16) & 0xFF) / 255.0
        let g = Double((v >> 8) & 0xFF) / 255.0
        let b = Double(v & 0xFF) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}
