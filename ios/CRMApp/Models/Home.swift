import Foundation

struct HomeSummary: Decodable {
    struct Counters: Decodable {
        let unread: Int
        let openTasks: Int
        let overdueTasks: Int
        let balance: Double
        let objects: Int
    }
    struct UrgentTask: Decodable, Identifiable {
        let id: String
        let title: String
        let dueDate: Date?
        let priority: String
        let overdue: Bool
        let project: Project?
        struct Project: Decodable { let id: String; let name: String }
    }
    struct UnreadMessage: Decodable, Identifiable {
        let id: String
        let subject: String?
        let fromAddr: String?
        let receivedAt: Date
        let mailbox: String?
    }
    struct Payment: Decodable, Identifiable {
        let id: String
        let date: Date
        let amount: Double
        let counterparty: String?
        let purpose: String?
        let accountNumber: String?
    }

    let now: Date
    let counters: Counters
    let urgentTasks: [UrgentTask]
    let unreadMessages: [UnreadMessage]
    let recentPayments: [Payment]
    let week: [String: [WeekTask]]
    let weekStart: String

    struct WeekTask: Decodable, Identifiable {
        let id: String
        let title: String
        let priority: String
    }
}

struct HomeBriefing: Decodable {
    let text: String
    let cached: Bool?
}
