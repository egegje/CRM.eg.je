import Foundation

@MainActor
final class TasksStore: ObservableObject {
    @Published var tasks: [CRMTask] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    enum Filter: String, CaseIterable, Identifiable {
        case mine, createdByMe, unassigned, overdue, done
        var id: String { rawValue }
        var title: String {
            switch self {
            case .mine: return "Мои"
            case .createdByMe: return "Поставлено мной"
            case .unassigned: return "Без исполнителя"
            case .overdue: return "Просроченные"
            case .done: return "Выполненные"
            }
        }
        var systemImage: String {
            switch self {
            case .mine: return "pin.fill"
            case .createdByMe: return "paperplane.fill"
            case .unassigned: return "questionmark.circle"
            case .overdue: return "clock.badge.exclamationmark"
            case .done: return "checkmark.circle"
            }
        }
    }

    func load(filter: Filter, currentUserId: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        // Show cached data immediately
        let cacheKey = "tasks-\(filter.rawValue)-\(currentUserId ?? "nil")"
        if tasks.isEmpty, let cached = CacheService.shared.load(for: cacheKey, as: [CRMTask].self) {
            tasks = cached
        }
        var params: [String: String] = ["limit": "500"]
        switch filter {
        case .mine:
            if let id = currentUserId { params["assigneeId"] = id }
            params["status"] = "open"
        case .createdByMe:
            if let id = currentUserId { params["creatorId"] = id }
            params["status"] = "open"
        case .unassigned:
            params["unassigned"] = "true"
            params["status"] = "open"
        case .overdue:
            params["status"] = "open"
        case .done:
            params["status"] = "done"
        }
        let q = params.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        do {
            var list = try await APIClient.shared.request(
                "GET", "/tasks?\(q)", as: [CRMTask].self
            )
            if filter == .overdue {
                let now = Date()
                list = list.filter { ($0.dueDate ?? .distantFuture) < now && $0.status != "done" }
            }
            tasks = list
            CacheService.shared.save(list, for: cacheKey)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            if tasks.isEmpty { tasks = [] }
        }
    }

    func patch(_ id: String, body: [String: Any]) async {
        // Manual JSON encoding because [String: Any] isn't Encodable.
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        var req = URLRequest(url: URL(string: "https://crm.eg.je/tasks/\(id)")!)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        _ = try? await URLSession.shared.data(for: req)
    }
}
