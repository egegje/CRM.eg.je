import Foundation

/// Thin wrapper over URLSession that talks to crm.eg.je REST API.
/// - Cookie-based session is persisted in HTTPCookieStorage.shared
///   across launches (no manual token handling).
/// - All requests are JSON in / JSON out.
enum APIError: LocalizedError {
    case invalidURL
    case network(Error)
    case http(Int, String)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Некорректный URL"
        case .network(let e): return "Сеть: \(e.localizedDescription)"
        case .http(let code, let msg): return "HTTP \(code): \(msg)"
        case .decoding(let e): return "Разбор ответа: \(e.localizedDescription)"
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    var baseURL = URL(string: "https://crm.eg.je")!

    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = HTTPCookieStorage.shared
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        cfg.timeoutIntervalForRequest = 30
        return URLSession(configuration: cfg)
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            let fmts = [
                ISO8601DateFormatter.withFractionalSeconds,
                ISO8601DateFormatter.plain,
            ]
            for fmt in fmts {
                if let d = fmt.date(from: s) { return d }
            }
            throw DecodingError.dataCorruptedError(
                in: c, debugDescription: "unparseable date \(s)"
            )
        }
        return d
    }()

    func request<Body: Encodable, Out: Decodable>(
        _ method: String,
        _ path: String,
        body: Body? = nil,
        as: Out.Type
    ) async throws -> Out {
        var req = try makeRequest(method, path)
        if let body {
            req.httpBody = try encoder.encode(body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, resp) = try await sessionData(for: req)
        try check(resp, data: data)
        if Out.self == EmptyResponse.self { return EmptyResponse() as! Out }
        do {
            return try decoder.decode(Out.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func request<Out: Decodable>(
        _ method: String,
        _ path: String,
        as: Out.Type
    ) async throws -> Out {
        try await request(method, path, body: Optional<EmptyRequest>.none, as: Out.self)
    }

    func requestVoid(_ method: String, _ path: String) async throws {
        _ = try await request(method, path, as: EmptyResponse.self)
    }

    // MARK: - internals

    private func makeRequest(_ method: String, _ path: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return req
    }

    private func sessionData(for req: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }
    }

    private func check(_ resp: URLResponse, data: Data) throws {
        guard let http = resp as? HTTPURLResponse else { return }
        if !(200..<300).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? ""
            throw APIError.http(http.statusCode, msg.isEmpty ? "—" : msg)
        }
    }
}

struct EmptyRequest: Encodable {}
struct EmptyResponse: Decodable {}

private extension ISO8601DateFormatter {
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
