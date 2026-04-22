import Foundation

struct CRMTask: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    var assigneeId: String?
    var creatorId: String
    var projectId: String?
    var dueDate: Date?
    var priority: String   // low | normal | high | urgent
    var status: String     // open | in_progress | awaiting_review | done | cancelled
    var category: String?
    var createdAt: Date
    var completedAt: Date?
    var reviewRequestedAt: Date?
    var project: Project?
    var comments: [TaskComment]?
    var tagAssignments: [TagAssignment]?
    var attachments: [TaskAttachment]?
    var coAssignees: [TaskCoAssignee]?
}

struct TaskCoAssignee: Codable, Hashable {
    let taskId: String
    let userId: String
}

struct Project: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let source: String?
    let externalId: String?
}

struct TaskComment: Codable, Identifiable, Hashable {
    let id: String
    let taskId: String
    let userId: String
    let text: String
    let createdAt: Date
}

struct TaskTag: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
}

struct TagAssignment: Codable, Hashable {
    let taskId: String
    let tagId: String
    let tag: TaskTag?
}

struct TaskAttachment: Codable, Identifiable, Hashable {
    let id: String
    let taskId: String
    let filename: String
    let mime: String
    let size: Int
    let createdAt: Date
}

struct TeamMemberStats: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let role: String
    let open: Int
    let overdue: Int
    let doneWeek: Int
}
