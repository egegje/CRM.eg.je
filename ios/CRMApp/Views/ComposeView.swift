import SwiftUI

struct ComposeView: View {
    @Environment(\.dismiss) private var dismiss
    var replyTo: MailMessage?

    @State private var mailboxId = ""
    @State private var to = ""
    @State private var cc = ""
    @State private var subject = ""
    @State private var bodyText = ""
    @State private var personaId = ""
    @State private var busy = false
    @State private var errorMsg: String?

    @State private var mailboxes: [Mailbox] = []
    @State private var personas: [Persona] = []

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("От ящика", selection: $mailboxId) {
                        Text("—").tag("")
                        ForEach(mailboxes) { mb in
                            Text(mb.displayName).tag(mb.id)
                        }
                    }
                    if !personas.isEmpty {
                        Picker("От имени", selection: $personaId) {
                            Text("— без визитки —").tag("")
                            ForEach(personas) { p in
                                Text(p.name).tag(p.id)
                            }
                        }
                    }
                }

                Section {
                    TextField("Кому", text: $to)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    TextField("Копия", text: $cc)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    TextField("Тема", text: $subject)
                }

                Section {
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 200)
                }

                if let err = errorMsg {
                    Section {
                        Text(err).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle(replyTo != nil ? "Ответить" : "Новое письмо")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Отправить") {
                        Task { await send() }
                    }
                    .disabled(busy || to.isEmpty || mailboxId.isEmpty)
                    .bold()
                }
            }
            .task { await loadOptions() }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let r = replyTo else { return }
        to = r.fromAddr
        subject = r.subject.hasPrefix("Re:") ? r.subject : "Re: \(r.subject)"
        bodyText = "\n\n--- Исходное сообщение ---\nОт: \(r.fromAddr)\n\(r.bodyText ?? "")"
    }

    private func loadOptions() async {
        mailboxes = (try? await APIClient.shared.request("GET", "/mailboxes", as: [Mailbox].self)) ?? []
        if let first = mailboxes.first, mailboxId.isEmpty { mailboxId = first.id }
        personas = (try? await APIClient.shared.request("GET", "/personas", as: [Persona].self)) ?? []
    }

    private func send() async {
        busy = true
        errorMsg = nil
        defer { busy = false }

        let toArr = to.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        let ccArr = cc.isEmpty ? [] : cc.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        do {
            // Create draft
            let draftBody: [String: Any] = [
                "mailboxId": mailboxId,
                "to": toArr,
                "cc": ccArr,
                "subject": subject,
                "bodyText": bodyText,
            ]
            guard let draftData = try? JSONSerialization.data(withJSONObject: draftBody) else { return }
            var createReq = URLRequest(url: URL(string: "https://crm.eg.je/messages")!)
            createReq.httpMethod = "POST"
            createReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            createReq.httpBody = draftData
            let session = await APIClient.urlSession
            let (respData, _) = try await session.data(for: createReq)

            if let draftResp = try? JSONSerialization.jsonObject(with: respData) as? [String: Any],
               let draftId = draftResp["id"] as? String {
                // Set persona if selected
                if !personaId.isEmpty {
                    let patchBody = try? JSONSerialization.data(withJSONObject: ["personaId": personaId])
                    var patchReq = URLRequest(url: URL(string: "https://crm.eg.je/messages/\(draftId)")!)
                    patchReq.httpMethod = "PATCH"
                    patchReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    patchReq.httpBody = patchBody
                    let s = await APIClient.urlSession; _ = try? await s.data(for: patchReq)
                }
                // Send
                var sendReq = URLRequest(url: URL(string: "https://crm.eg.je/messages/\(draftId)/send")!)
                sendReq.httpMethod = "POST"
                sendReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
                sendReq.httpBody = "{}".data(using: .utf8)
                let s = await APIClient.urlSession; _ = try await s.data(for: sendReq)
            }
            dismiss()
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

struct Persona: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let signature: String
}
