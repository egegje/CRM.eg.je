import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "checkmark.seal.fill")
                    .resizable().scaledToFit().frame(width: 72, height: 72)
                    .foregroundStyle(.tint)
                Text("crm.eg.je").font(.largeTitle).bold()
                Text("Войдите под своим аккаунтом")
                    .foregroundStyle(.secondary)

                VStack(spacing: 10) {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                    SecureField("Пароль", text: $password)
                        .textContentType(.password)
                }
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)

                if let err = auth.loginError {
                    Text(err).foregroundStyle(.red).font(.footnote)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Button {
                    Task {
                        busy = true
                        await auth.login(email: email, password: password)
                        busy = false
                    }
                } label: {
                    if busy {
                        ProgressView().tint(.white).frame(maxWidth: .infinity)
                    } else {
                        Text("Войти").frame(maxWidth: .infinity).fontWeight(.semibold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(busy || email.isEmpty || password.isEmpty)
                .padding(.horizontal)

                Spacer()
            }
        }
    }
}
