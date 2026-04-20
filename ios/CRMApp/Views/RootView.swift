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
            DashboardView(onNavigate: { tab = $0 })
                .tag(0)
                .tabItem {
                    Image(systemName: tab == 0 ? "house.fill" : "house")
                    Text("Главная")
                }

            TaskListView()
                .tag(1)
                .tabItem {
                    Image(systemName: tab == 1 ? "checkmark.circle.fill" : "checkmark.circle")
                    Text("Задачи")
                }

            MailListView()
                .tag(2)
                .tabItem {
                    Image(systemName: tab == 2 ? "paperplane.fill" : "paperplane")
                    Text("Почта")
                }

            FinanceView()
                .tag(3)
                .tabItem {
                    Image(systemName: tab == 3 ? "dollarsign.circle.fill" : "dollarsign.circle")
                    Text("Финансы")
                }

            MoreView()
                .tag(4)
                .tabItem {
                    Image(systemName: "ellipsis")
                    Text("Ещё")
                }
        }
        .tint(Color(hex: "#6366F1"))
    }
}


struct MoreView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var showTeam = false

    private var isAdmin: Bool {
        auth.user?.role == "owner" || auth.user?.role == "admin"
    }

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
                if isAdmin {
                    Section("Команда") {
                        Button {
                            showTeam = true
                        } label: {
                            Label("Дашборд команды", systemImage: "person.3")
                        }
                    }
                    Section("Администрирование") {
                        NavigationLink { AdminContactsView() } label: {
                            Label("Контакты", systemImage: "person.crop.rectangle.stack")
                        }
                        NavigationLink { AdminUsersView() } label: {
                            Label("Пользователи", systemImage: "person.badge.key")
                        }
                        NavigationLink { AdminMailboxesView() } label: {
                            Label("Почтовые ящики", systemImage: "tray.2")
                        }
                        NavigationLink { AdminPersonasView() } label: {
                            Label("Персоны (подписи)", systemImage: "person.text.rectangle")
                        }
                        NavigationLink { AdminRulesView() } label: {
                            Label("Правила почты", systemImage: "line.3.horizontal.decrease")
                        }
                    }
                    Section("Настройки и аналитика") {
                        NavigationLink { AdminTaskSettingsView() } label: {
                            Label("Настройки задач", systemImage: "gear")
                        }
                        NavigationLink { AdminTelegramView() } label: {
                            Label("Telegram", systemImage: "paperplane.circle")
                        }
                        NavigationLink { AdminAuditView() } label: {
                            Label("Журнал", systemImage: "list.bullet.clipboard")
                        }
                        NavigationLink { AdminAnalyticsView() } label: {
                            Label("Аналитика", systemImage: "chart.bar")
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
