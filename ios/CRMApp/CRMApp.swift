import SwiftUI
import LocalAuthentication

@main
struct CRMApp: App {
    @StateObject private var auth = AuthStore()
    @State private var unlocked = false

    var body: some Scene {
        WindowGroup {
            Group {
                if unlocked {
                    RootView()
                        .environmentObject(auth)
                        .task { await auth.checkSession() }
                } else {
                    LockScreen(onUnlock: { unlocked = true })
                }
            }
            .onAppear { authenticate() }
        }
    }

    private func authenticate() {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            unlocked = true
            return
        }
        ctx.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: "Разблокировать CRM"
        ) { ok, _ in
            DispatchQueue.main.async {
                if ok { unlocked = true }
            }
        }
    }
}

struct LockScreen: View {
    let onUnlock: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "lock.shield.fill")
                .resizable().scaledToFit().frame(width: 64, height: 64)
                .foregroundStyle(.tint)
            Text("CRM").font(.largeTitle).bold()
            Text("Разблокируйте для входа")
                .foregroundStyle(.secondary)
            Button("Разблокировать") {
                let ctx = LAContext()
                ctx.evaluatePolicy(
                    .deviceOwnerAuthentication,
                    localizedReason: "Разблокировать CRM"
                ) { ok, _ in
                    if ok { DispatchQueue.main.async { onUnlock() } }
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button("Без блокировки") { onUnlock() }
                .buttonStyle(.bordered)
            Spacer()
        }
    }
}
