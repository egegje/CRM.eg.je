import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published var user: User?
    @Published var isChecking = true
    @Published var loginError: String?

    func checkSession() async {
        isChecking = true
        defer { isChecking = false }
        do {
            let me = try await APIClient.shared.request("GET", "/me", as: User.self)
            user = me
        } catch {
            user = nil
        }
    }

    func login(email: String, password: String) async {
        loginError = nil
        struct Body: Encodable { let email: String; let password: String }
        do {
            let u = try await APIClient.shared.request(
                "POST", "/auth/login",
                body: Body(email: email, password: password),
                as: User.self
            )
            user = u
        } catch {
            loginError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func logout() async {
        try? await APIClient.shared.requestVoid("POST", "/auth/logout")
        user = nil
    }
}
