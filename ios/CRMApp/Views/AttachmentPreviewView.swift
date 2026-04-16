import SwiftUI
import QuickLook

/// In-app preview for mail attachments (PDF, images, docs) via QuickLook.
/// Downloads the file to a temp path first, then shows QLPreviewController.
struct AttachmentPreviewView: View {
    let attachmentId: String
    let filename: String
    @Environment(\.dismiss) private var dismiss

    @State private var localURL: URL?
    @State private var isLoading = true
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            ZStack {
                if let url = localURL {
                    QuickLookView(url: url)
                        .ignoresSafeArea(edges: .bottom)
                } else if isLoading {
                    ProgressView("Загрузка…")
                } else if let err = errorMsg {
                    ContentUnavailableView(
                        "Не удалось открыть",
                        systemImage: "exclamationmark.triangle",
                        description: Text(err)
                    )
                }
            }
            .navigationTitle(filename)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                if let url = localURL {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
            }
            .task { await download() }
        }
    }

    private func download() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let url = URL(string: "https://crm.eg.je/attachments/\(attachmentId)")!
            var req = URLRequest(url: url)
            req.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
            let session = await APIClient.urlSession
            let (data, resp) = try await session.data(for: req)
            if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                errorMsg = "HTTP \(http.statusCode)"
                return
            }
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + "-" + filename)
            try data.write(to: tmp)
            localURL = tmp
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let c = QLPreviewController()
        c.dataSource = context.coordinator
        return c
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
