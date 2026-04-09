import SwiftUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var oldPassword = ""
    @State private var newPassword = ""
    @State private var busy = false
    @State private var message = ""
    @State private var isError = false

    var body: some View {
        Form {
            Section {
                SecureField("Текущий пароль", text: $oldPassword)
                    .textContentType(.password)
                SecureField("Новый пароль (мин. 4 символа)", text: $newPassword)
                    .textContentType(.newPassword)
            }
            if !message.isEmpty {
                Section {
                    Text(message)
                        .foregroundStyle(isError ? .red : .green)
                        .font(.footnote)
                }
            }
            Section {
                Button {
                    Task { await changePassword() }
                } label: {
                    if busy {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Сменить пароль").frame(maxWidth: .infinity)
                    }
                }
                .disabled(oldPassword.isEmpty || newPassword.count < 4 || busy)
            }
        }
        .navigationTitle("Смена пароля")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func changePassword() async {
        busy = true
        message = ""
        defer { busy = false }
        do {
            struct Body: Encodable { let oldPassword: String; let newPassword: String }
            _ = try await APIClient.shared.request(
                "POST", "/me/password",
                body: Body(oldPassword: oldPassword, newPassword: newPassword),
                as: EmptyResponse.self
            )
            message = "Пароль обновлён"
            isError = false
            try? await Task.sleep(for: .seconds(1.5))
            dismiss()
        } catch {
            message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            isError = true
        }
    }
}
