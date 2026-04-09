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

            MailListView()
                .tabItem { Label("Почта", systemImage: "envelope") }

            FinanceView()
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
    @State private var showTeam = false

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
                if auth.user?.role == "owner" || auth.user?.role == "admin" {
                    Section("Управление") {
                        Button {
                            showTeam = true
                        } label: {
                            Label("Команда", systemImage: "person.3")
                        }
                    }
                }
                Section("Безопасность") {
                    NavigationLink {
                        ChangePasswordView()
                    } label: {
                        Label("Сменить пароль", systemImage: "key")
                    }
                }
                Section {
                    Link(destination: URL(string: "https://crm.eg.je")!) {
                        Label("Открыть веб-версию", systemImage: "safari")
                    }
                }
                Section {
                    Button(role: .destructive) {
                        Task { await auth.logout() }
                    } label: {
                        Label("Выйти", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                Section {
                    LabeledContent("Версия", value: "0.1.0")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ещё")
            .sheet(isPresented: $showTeam) {
                NavigationStack {
                    TeamView()
                        .navigationTitle("Команда")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Закрыть") { showTeam = false }
                            }
                        }
                }
            }
        }
    }
}
