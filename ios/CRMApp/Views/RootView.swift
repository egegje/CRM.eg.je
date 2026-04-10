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
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            TaskListView()
                .tag(0)
                .tabItem {
                    Image(systemName: tab == 0 ? "checkmark.circle.fill" : "checkmark.circle")
                    Text("Задачи")
                }

            MailListView()
                .tag(1)
                .tabItem {
                    Image(systemName: tab == 1 ? "paperplane.fill" : "paperplane")
                    Text("Почта")
                }

            FinanceView()
                .tag(2)
                .tabItem {
                    Image(systemName: tab == 2 ? "dollarsign.circle.fill" : "dollarsign.circle")
                    Text("Финансы")
                }

            MoreView()
                .tag(3)
                .tabItem {
                    Image(systemName: "ellipsis")
                    Text("Ещё")
                }
        }
        .tint(.accentColor)
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
            .navigationBarTitleDisplayMode(.inline)
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
