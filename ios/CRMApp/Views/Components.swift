import SwiftUI

// MARK: - Avatar with initials (like Telegram)

struct AvatarView: View {
    let name: String
    var size: CGFloat = 40

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.map { String($0.prefix(1)).uppercased() }.joined()
    }

    private var color: Color {
        let colors: [Color] = [.blue, .green, .orange, .purple, .pink, .teal, .indigo, .mint, .cyan, .brown]
        let hash = abs(name.hashValue) % colors.count
        return colors[hash]
    }

    var body: some View {
        ZStack {
            Circle().fill(color.gradient)
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Priority indicator

struct PriorityDot: View {
    let priority: String

    var body: some View {
        switch priority {
        case "urgent":
            Image(systemName: "flame.fill")
                .font(.system(size: 12))
                .foregroundStyle(.red)
        case "high":
            Circle().fill(.orange).frame(width: 8, height: 8)
        case "low":
            Circle().fill(Color(.tertiaryLabel)).frame(width: 6, height: 6)
        default:
            EmptyView()
        }
    }
}

// MARK: - Status pill

struct StatusPill: View {
    let status: String

    private var config: (String, Color) {
        switch status {
        case "in_progress": return ("в работе", .orange)
        case "done": return ("выполнена", .green)
        case "cancelled": return ("отменена", .gray)
        default: return ("", .clear)
        }
    }

    var body: some View {
        let (text, color) = config
        if !text.isEmpty {
            Text(text)
                .font(.system(size: 10, weight: .medium))
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(color.opacity(0.12))
                .foregroundStyle(color)
                .clipShape(Capsule())
        }
    }
}

// MARK: - Label pill

struct LabelPill: View {
    let text: String
    var color: Color = .accentColor

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Stat card (for finance / team)

struct StatCard: View {
    let title: String
    let value: String
    var color: Color = .primary
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            if let sub = subtitle {
                Text(sub)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Money formatter

func formatMoney(_ value: Double) -> String {
    let fmt = NumberFormatter()
    fmt.numberStyle = .decimal
    fmt.minimumFractionDigits = 2
    fmt.maximumFractionDigits = 2
    fmt.groupingSeparator = " "
    fmt.decimalSeparator = ","
    return fmt.string(from: NSNumber(value: value)) ?? "0,00"
}
