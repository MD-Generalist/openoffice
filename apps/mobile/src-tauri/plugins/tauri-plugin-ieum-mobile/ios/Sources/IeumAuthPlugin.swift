import AuthenticationServices
import Foundation
import Security
import Tauri
import UIKit

struct LaunchAuthArgs: Decodable {
    let authUrl: String
    let callbackScheme: String
}

struct KeychainWriteArgs: Decodable {
    let account: String
    let valueBase64: String
}

struct KeychainReadArgs: Decodable {
    let account: String
}

/**
 * iOS Keychain secret storage and ASWebAuthenticationSession launcher.
 */
public final class IeumAuthPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
    private let service = "com.ieumoffice.mobile.secrets"
    private var activeSession: ASWebAuthenticationSession?

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.manager.viewController?.view.window ?? ASPresentationAnchor()
    }

    @objc public func launchAuthBrowser(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(LaunchAuthArgs.self)
        guard let url = URL(string: args.authUrl), url.scheme == "https" else {
            invoke.reject("INVALID_ARGUMENT: auth URL must use https")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: args.callbackScheme
            ) { callbackUrl, error in
                self.activeSession = nil
                if let error {
                    invoke.reject("USER_CANCELLED: \(error.localizedDescription)")
                    return
                }
                invoke.resolve(["callbackUrl": callbackUrl?.absoluteString ?? ""])
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.activeSession = session
            if !session.start() {
                self.activeSession = nil
                invoke.reject("INTERNAL_ERROR: failed to start ASWebAuthenticationSession")
            }
        }
    }

    @objc public func writeKeychainItem(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(KeychainWriteArgs.self)
        guard let data = Data(base64Encoded: args.valueBase64) else {
            invoke.reject("INVALID_ARGUMENT: invalid base64")
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: args.account,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        if status != errSecSuccess {
            invoke.reject("INTERNAL_ERROR: keychain write failed (\(status))")
            return
        }
        invoke.resolve(["ok": true])
    }

    @objc public func readKeychainItem(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(KeychainReadArgs.self)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: args.account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            invoke.resolve([:])
            return
        }
        if status != errSecSuccess {
            invoke.reject("INTERNAL_ERROR: keychain read failed (\(status))")
            return
        }
        guard let data = result as? Data else {
            invoke.resolve([:])
            return
        }
        invoke.resolve(["valueBase64": data.base64EncodedString()])
    }
}
