import Foundation

struct MailMessage: Codable, Identifiable, Hashable {
    let id: String
    let mailboxId: String
    let folderId: String
    var fromAddr: String
    var toAddrs: [String]
    var ccAddrs: [String]
    var subject: String
    var bodyText: String?
    var bodyHtml: String?
    var isRead: Bool
    var isStarred: Bool
    var isDraft: Bool
    var receivedAt: Date?
    var sentAt: Date?
    var aiSummary: String?
    var aiPriority: String?
}

struct Mailbox: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let displayName: String
    let enabled: Bool
}
