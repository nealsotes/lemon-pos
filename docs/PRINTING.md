# Printing setup and operator checks

Printing an existing receipt, reprinting from Reports, and Print Test Receipt do not open the drawer, create another sale, or alter totals. Use **Open Drawer** deliberately and separately. Confirm which physical drawer/printer you are operating before doing so.

## Choose one transport in Printer Settings

The saved choice applies to receipts, test receipts, printer checks, and drawer commands. A failed or partially submitted job is **not** retried through a different transport. Check the queue, external app, and paper before explicitly retrying, to avoid duplicate receipts or drawer pulses.

- **Desktop QZ Tray** (desktop default): install the correct OS printer driver and [QZ Tray](https://qz.io/download/) on the cashier's computer, start QZ Tray, approve the site's trust prompts, check the connection, then select the actual OS printer. Installing the npm package alone does not install QZ Tray. QZ Tray is LGPL 2.1; warning-free silent printing requires signing/trust certificate setup. This phase does not purchase certificates or introduce signing. Never put a private signing key in frontend code.
- **Android RawBT** (Android default): install RawBT separately, configure its printer/connection and ESC/POS/raw mode as supported by the actual printer, and test inside RawBT first. Press Print from a user gesture and allow the browser to open the app. Lemon POS requests `rawbt:base64,<raw ESC/POS bytes>` once. A browser cannot detect that RawBT is installed, accepted the job, or printed paper. If nothing opens, check app configuration/browser permissions; an explicit retry, Share receipt file, or Download receipt file is available in Printer Settings. These are separate user actions, not automatic fallbacks. Do not repeatedly press Print while a job may already be queued.
- **Compatible BLE**: requires a browser with Web Bluetooth, a secure context (HTTPS or localhost), and a printer with a compatible writable BLE/GATT service. Connect through the user-initiated chooser each browser session as needed. **BLE is not Bluetooth Classic SPP**; a printer merely being branded Bluetooth or appearing in Android's paired list does not establish compatibility. Classic-only printers need an appropriate native print app such as RawBT on Android, or a supported desktop connection. Cancelling a chooser or share sheet does not start a different print method.
- **Backend printer — locally hosted store server only**: opt-in for an operator-managed Lemon POS backend on the store network with its printer configured. The printer is attached to the server, not necessarily the cashier device. Never choose this expecting Railway/cloud hosting to reach a store's USB/Bluetooth printer. The app does not automatically send print/drawer requests to the backend. An API response is submission evidence, not a hardware acknowledgement.

QZ Tray and RawBT are not iOS solutions. On unsupported devices the app reports setup guidance rather than silently trying an incompatible transport. Backend use on such a device still requires the explicitly selected, locally hosted store server. Existing printer-name preferences are retained; legacy Android `mobilePrintMethod` preferences are migrated to the explicit transport choice. No model, connection type, or paper width is inferred from a saved name.

## What the result means

| Status | Meaning | Not proof of |
| --- | --- | --- |
| Submitted | Selected QZ/BLE/backend path accepted a submission/write | Paper printed, cutter worked, or drawer physically opened |
| External-app handoff — unconfirmed | Browser requested RawBT or completed a share handoff | App installed, printer reached, paper printed, or drawer opened |
| Downloaded | Receipt file download requested; open it manually in a configured app | Any print submission or physical print |
| Cancelled | User cancelled sharing | A print; no fallback is launched |
| Error | Setup, connection, or submission failed; inspect the actual queue before retrying | That zero bytes reached the printer |

A connection/printer check never prints or opens the drawer. A test receipt is dummy data only; it is not a recorded sale. Share/download exports contain raw bytes and must be treated as receipt data, not an image or a PDF. Neither action automatically prints or adds a drawer command.

## Xprinter hardware validation: PENDING / UNVERIFIED

Only the brand **Xprinter** is known. Exact model, Android/desktop device, OS/browser, USB vs Bluetooth vs Wi-Fi, Bluetooth Classic vs BLE, ESC/POS compatibility, paper width, driver, and drawer wiring/pulse requirements are unknown. No claim of physical paper or drawer success is made by automated tests or browser walkthroughs.

Before live operation, record the exact hardware/connection and consult its manual. With a dummy receipt and no live sale, verify one receipt, test receipt and Reports reprint produce the expected paper without a drawer kick. Only after checking drawer compatibility/wiring, deliberately verify the separate Open Drawer action. Check disconnected/offline behaviour and manual retry for duplicates. Record observed paper/drawer results separately from mocked transport tests. Do not test against live clients or a production database.

## Scope and references

This phase adds no Android APK/companion, new printer library, localhost HTTP listener, dependency upgrade, or deployment configuration. A future own Android companion remains **design only**, subject to a separate owner decision and hardware/license review. DantSu's MIT Android ESC/POS library is a possible future building block, not a ready browser drop-in. Unlicensed alternatives are not redistributed.

Primary references:
- [RawBT maintainer demo, `test2`](https://github.com/402d/DemoRawBtPrinter/blob/master/app/src/main/java/ru/a402d/demorawbt/MainActivity.java)
- [Chrome Web Bluetooth: BLE/GATT, secure context and user gesture](https://developer.chrome.com/docs/capabilities/bluetooth)
- [Chrome Android intents and user gestures](https://developer.chrome.com/docs/android/intents)
- [QZ licensing](https://qz.io/docs/licensing) and [FAQ](https://qz.io/docs/faq)
- [DantSu Android library](https://github.com/DantSu/ESCPOS-ThermalPrinter-Android) and [MIT license](https://github.com/DantSu/ESCPOS-ThermalPrinter-Android/blob/master/LICENSE)
