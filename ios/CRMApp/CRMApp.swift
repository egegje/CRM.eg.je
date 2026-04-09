import SwiftUI

@main
struct CRMApp: App {
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .task { await auth.checkSession() }
        }
    }
}
