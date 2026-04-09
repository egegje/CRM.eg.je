import SwiftUI

struct RootView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        Group {
            if auth.isChecking {
                ProgressView("…")
            } else if auth.user == nil {
                LoginView()
            } else {
                MainTabs()
            }
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            TaskListView()
                .tabItem { Label("Задачи", systemImage: "checkmark.circle") }

            ComingSoonView(title: "Почта")
                .tabItem { Label("Почта", systemImage: "envelope") }

            ComingSoonView(title: "Финансы")
                .tabItem { Label("Финансы", systemImage: "rublesign.circle") }

            MoreView()
                .tabItem { Label("Ещё", systemImage: "ellipsis.circle") }
        }
    }
}

struct ComingSoonView: View {
    let title: String
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "\(title) — скоро",
                systemImage: "hammer",
                description: Text("Экран пока не реализован нативно. В следующем релизе.")
            )
            .navigationTitle(title)
        }
    }
}

struct MoreView: View {
    @EnvironmentObject var auth: AuthStore
    var body: some View {
        NavigationStack {
            List {
                if let u = auth.user {
                    Section("Профиль") {
                        LabeledContent("Имя", value: u.name)
                        LabeledContent("Email", value: u.email)
                        LabeledContent("Роль", value: u.role)
                    }
                }
                Section {
                    Button(role: .destructive) {
                        Task { await auth.logout() }
                    } label: {
                        Label("Выйти", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Ещё")
        }
    }
}
