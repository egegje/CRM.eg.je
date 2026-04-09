import Foundation

/// Simple disk cache for offline access. Stores JSON responses
/// keyed by endpoint path. Cache is stored in the app's caches
/// directory and survives app restarts but can be purged by iOS
/// when storage is low.
final class CacheService {
    static let shared = CacheService()
    private let dir: URL

    private init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        dir = caches.appendingPathComponent("api-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func fileURL(for key: String) -> URL {
        let safe = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key
        return dir.appendingPathComponent(safe + ".json")
    }

    func save<T: Encodable>(_ value: T, for key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: fileURL(for: key))
    }

    func load<T: Decodable>(for key: String, as type: T.Type) -> T? {
        let url = fileURL(for: key)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    func clear() {
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
}
