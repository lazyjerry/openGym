import AVFoundation
import Capacitor
import UIKit
import Vision

/**
 * The barcode scanner on iOS, for the gym membership card (lib/scan.js). Android keeps
 * @capacitor-mlkit/barcode-scanning; on iOS that plugin needs Google ML Kit, which comes only
 * through CocoaPods, so the app (on Swift Package Manager) answers to the same JS name with the
 * system's own readers instead: AVFoundation for the live camera, Vision for a picked image.
 * capacitor.config.json keeps the ML Kit plugin out of the iOS build (ios.includePlugins).
 *
 * Same calls and the same answers as the ML Kit plugin, as far as lib/scan.js uses them:
 *   isSupported()                  { supported }
 *   checkPermissions()             { camera: 'granted' | 'denied' | 'prompt' }
 *   requestPermissions()           the same, after asking
 *   scan()                         { barcodes: [{ rawValue, displayValue, format }] }, [] if closed
 *   readBarcodesFromImage({ path }) the same, from a file URL
 * `format` uses ML Kit's names ('QR_CODE', 'EAN_13', …), which lib/qr.js normalizeFmt folds.
 */
@objc(BarcodeScanPlugin)
public class BarcodeScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BarcodeScanPlugin"
    public let jsName = "BarcodeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readBarcodesFromImage", returnType: CAPPluginReturnPromise),
    ]

    private var scanner: BarcodeScanViewController?

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AVCaptureDevice.default(for: .video) != nil])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["camera": Self.cameraState()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { _ in
            call.resolve(["camera": Self.cameraState()])
        }
    }

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else { call.reject("no view to show the scanner in"); return }
            let vc = BarcodeScanViewController { [weak self] found in
                self?.scanner = nil
                call.resolve(["barcodes": found.map { [$0] } ?? []])
            }
            vc.modalPresentationStyle = .fullScreen
            self.scanner = vc
            host.present(vc, animated: true)
        }
    }

    @objc func readBarcodesFromImage(_ call: CAPPluginCall) {
        // lib/scan.js hands over Filesystem.writeFile's uri, a file:// URL.
        let path = call.getString("path") ?? ""
        let file = path.hasPrefix("file://") ? (URL(string: path)?.path ?? "") : path
        guard let image = UIImage(contentsOfFile: file), let cg = image.cgImage else {
            call.reject("could not read the image")
            return
        }
        let request = VNDetectBarcodesRequest { req, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let found = (req.results as? [VNBarcodeObservation] ?? []).compactMap { o -> [String: Any]? in
                guard let value = o.payloadStringValue, !value.isEmpty else { return nil }
                return Self.barcode(value, format: Self.format(of: o.symbology))
            }
            call.resolve(["barcodes": found])
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do { try VNImageRequestHandler(cgImage: cg, orientation: Self.orientation(of: image), options: [:]).perform([request]) }
            catch { call.reject(error.localizedDescription) }
        }
    }

    static func barcode(_ value: String, format: String) -> [String: Any] {
        ["rawValue": value, "displayValue": value, "format": format]
    }

    private static func cameraState() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "granted"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    private static func format(of s: VNBarcodeSymbology) -> String {
        switch s {
        case .qr, .microQR: return "QR_CODE"
        case .aztec: return "AZTEC"
        case .codabar: return "CODABAR"
        case .code39, .code39Checksum, .code39FullASCII, .code39FullASCIIChecksum: return "CODE_39"
        case .code93, .code93i: return "CODE_93"
        case .code128: return "CODE_128"
        case .dataMatrix: return "DATA_MATRIX"
        case .ean8: return "EAN_8"
        case .ean13: return "EAN_13"
        case .itf14, .i2of5, .i2of5Checksum: return "ITF"
        case .pdf417, .microPDF417: return "PDF_417"
        case .upce: return "UPC_E"
        default: return "UNKNOWN"
        }
    }

    private static func orientation(of image: UIImage) -> CGImagePropertyOrientation {
        switch image.imageOrientation {
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        default: return .up
        }
    }
}

/// The full-screen camera: the first code it reads closes it, and so does the close button.
final class BarcodeScanViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let done: ([String: Any]?) -> Void
    private var finished = false

    private static let types: [AVMetadataObject.ObjectType: String] = {
        var t: [AVMetadataObject.ObjectType: String] = [
            .qr: "QR_CODE", .aztec: "AZTEC", .code39: "CODE_39", .code39Mod43: "CODE_39", .code93: "CODE_93",
            .code128: "CODE_128", .dataMatrix: "DATA_MATRIX", .ean8: "EAN_8", .ean13: "EAN_13",
            .itf14: "ITF", .interleaved2of5: "ITF", .pdf417: "PDF_417", .upce: "UPC_E",
        ]
        if #available(iOS 15.4, *) { t[.codabar] = "CODABAR" }
        return t
    }()

    init(done: @escaping ([String: Any]?) -> Void) {
        self.done = done
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let output = AVCaptureMetadataOutput()
        if let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device),
           session.canAddInput(input), session.canAddOutput(output) {
            session.addInput(input)
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = Self.types.keys.filter { output.availableMetadataObjectTypes.contains($0) }
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.bounds
            view.layer.addSublayer(preview)
        }
        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        close.tintColor = .white
        close.accessibilityLabel = NSLocalizedString("Close", comment: "")
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(close)
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            close.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            close.widthAnchor.constraint(equalToConstant: 44),
            close.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.layer.sublayers?.compactMap { $0 as? AVCaptureVideoPreviewLayer }.forEach { $0.frame = view.bounds }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.stopRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let code = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first(where: { !($0.stringValue ?? "").isEmpty }),
              let value = code.stringValue else { return }
        finish(BarcodeScanPlugin.barcode(value, format: Self.types[code.type] ?? "UNKNOWN"))
    }

    @objc private func cancel() { finish(nil) }

    private func finish(_ found: [String: Any]?) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { self.done(found) }
    }
}
