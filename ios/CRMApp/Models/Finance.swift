import Foundation

struct SberClientInfo: Codable {
    let fullName: String?
    let shortName: String?
    let inn: String?
    let accounts: [SberAccount]?
}

struct SberAccount: Codable, Identifiable, Hashable {
    var id: String { number }
    let number: String
    let name: String?
    let currencyCode: String?
    let bic: String?
    let type: String?
    let state: String?
    let openDate: String?
}

struct SberAmount: Codable {
    let amount: String
    let currencyName: String?
}

struct SberStatementSummary: Codable {
    let closingBalance: SberAmount?
    let openingBalance: SberAmount?
    let debitTurnover: SberAmount?
    let creditTurnover: SberAmount?
    let debitTransactionsNumber: Int?
    let creditTransactionsNumber: Int?
}
