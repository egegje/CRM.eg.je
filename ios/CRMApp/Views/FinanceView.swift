import SwiftUI

struct FinanceView: View {
    @State private var clientInfo: SberClientInfo?
    @State private var summaries: [String: SberStatementSummary] = [:]
    @State private var isLoading = false
    @State private var errorMsg: String?
    @State private var selectedAccount: SberAccount?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if isLoading && clientInfo == nil {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                    } else if let err = errorMsg {
                        ContentUnavailableView(
                            "Ошибка",
                            systemImage: "exclamationmark.triangle",
                            description: Text(err)
                        )
                    } else if let info = clientInfo {
                        // Total balance
                        let total = summaries.values.compactMap { s in
                            Double(s.closingBalance?.amount ?? "0")
                        }.reduce(0, +)

                        VStack(alignment: .leading, spacing: 2) {
                            let name = info.fullName ?? info.shortName ?? ""
                            let short = name
                                .replacingOccurrences(of: "ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ", with: "ИП ")
                                .replacingOccurrences(of: "Индивидуальный предприниматель ", with: "ИП ")
                                .replacingOccurrences(of: "ГНАТЮК ", with: "")
                                .replacingOccurrences(of: "Гнатюк ", with: "")
                            Text(short)
                                .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                        .padding(.horizontal)

                        // Account cards
                        ForEach(info.accounts ?? [], id: \.number) { acc in
                            if acc.state == "OPEN" {
                                accountCard(acc)
                                    .onTapGesture { selectedAccount = acc }
                            }
                        }
                    } else {
                        ContentUnavailableView(
                            "Сбер не подключён",
                            systemImage: "building.columns",
                            description: Text("Подключите в веб-версии crm.eg.je")
                        )
                    }
                }
                .padding(.vertical)
            }
            .refreshable { await loadData() }
            .navigationTitle("Финансы")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadData() }
            .sheet(item: $selectedAccount) { acc in
                NavigationStack {
                    StatementView(accountNumber: acc.number, bic: acc.bic ?? "")
                }
            }
        }
    }

    private func accountCard(_ acc: SberAccount) -> some View {
        let summary = summaries[acc.number]
        let balance = Double(summary?.closingBalance?.amount ?? "0") ?? 0
        let debit = Double(summary?.debitTurnover?.amount ?? "0") ?? 0
        let credit = Double(summary?.creditTurnover?.amount ?? "0") ?? 0

        return VStack(alignment: .leading, spacing: 10) {
            // Balance
            Text(fmtMoney(balance) + " ₽")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.7)
                .lineLimit(1)

            // Account number
            Text(acc.number)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(.secondary)

            // Turnovers
            if summary != nil {
                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.right").font(.caption2)
                        Text(fmtMoney(debit))
                            .font(.caption).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(.red)

                    HStack(spacing: 4) {
                        Image(systemName: "arrow.down.left").font(.caption2)
                        Text(fmtMoney(credit))
                            .font(.caption).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(.green)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func fmtMoney(_ v: Double) -> String { formatMoney(v) }

    private func loadData() async {
        isLoading = true
        errorMsg = nil
        defer { isLoading = false }
        do {
            let info = try await APIClient.shared.request("GET", "/api/sber/accounts", as: SberClientInfo.self)
            clientInfo = info
            let today = Date().formatted(.iso8601.year().month().day())
            for acc in info.accounts ?? [] where acc.state == "OPEN" {
                if let s = try? await APIClient.shared.request(
                    "GET", "/api/sber/statement/summary?accountNumber=\(acc.number)&statementDate=\(today)",
                    as: SberStatementSummary.self
                ) {
                    summaries[acc.number] = s
                }
            }
        } catch {
            errorMsg = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

}

struct StatementView: View {
    let accountNumber: String
    let bic: String
    @Environment(\.dismiss) private var dismiss
    @State private var transactions: [BankTx] = []
    @State private var isLoading = false
    @State private var dateFrom = Calendar.current.date(byAdding: .day, value: -30, to: Date())!
    @State private var dateTo = Date()

    var body: some View {
        List {
            Section {
                DatePicker("С", selection: $dateFrom, displayedComponents: .date)
                DatePicker("По", selection: $dateTo, displayedComponents: .date)
                Button("Загрузить") { Task { await load() } }
                    .disabled(isLoading)
            }

            let debitSum = transactions.filter { $0.direction == "DEBIT" }.map { Double($0.amount) ?? 0 }.reduce(0, +)
            let creditSum = transactions.filter { $0.direction == "CREDIT" }.map { Double($0.amount) ?? 0 }.reduce(0, +)

            Section("Итого за период") {
                LabeledContent("Расход", value: "−\(formatMoney(debitSum))")
                    .foregroundStyle(.red)
                LabeledContent("Приход", value: "+\(formatMoney(creditSum))")
                    .foregroundStyle(.green)
                LabeledContent("Операций", value: "\(transactions.count)")
            }

            Section("Операции") {
                ForEach(transactions) { tx in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tx.counterpartyName ?? "—")
                                .font(.subheadline).lineLimit(1)
                            Text(tx.paymentPurpose ?? "")
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            let amt = Double(tx.amount) ?? 0
                            Text("\(tx.direction == "DEBIT" ? "−" : "+")\(formatMoney(amt))")
                                .font(.subheadline).fontWeight(.semibold)
                                .foregroundStyle(tx.direction == "DEBIT" ? .red : .green)
                            Text(tx.operationDate.prefix(10))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Выписка")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Закрыть") { dismiss() }
            }
        }
        .overlay {
            if isLoading { ProgressView() }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let from = fmt.string(from: dateFrom)
        let to = fmt.string(from: dateTo)
        transactions = (try? await APIClient.shared.request(
            "GET", "/api/sber/local/transactions?accountNumber=\(accountNumber)&dateFrom=\(from)&dateTo=\(to)&limit=500",
            as: [BankTx].self
        )) ?? []
    }

}

struct BankTx: Codable, Identifiable, Hashable {
    let id: String
    let accountNumber: String
    let operationDate: String
    let amount: String
    let direction: String
    let counterpartyName: String?
    let counterpartyInn: String?
    let paymentPurpose: String?
}
