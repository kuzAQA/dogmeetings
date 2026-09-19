# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> returns to nearby without a page snapshot
- Location: e2e/site.spec.ts:177:1

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /Users/ikuznetsov/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --disable-updater-scheduler --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/1p/_3cmbf353qzc4kj5hh1j08g80000gn/T/playwright_chromiumdev_profile-eNvYkS --remote-debugging-pipe --no-startup-window
<launched> pid=64731
[pid=64731][err] [0918/235131.728291:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9
[pid=64731][err] [0918/235131.730150:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.
[pid=64731][err] [0918/235131.730545:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.
[pid=64731][err] [0918/235131.730599:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.64731: Permission denied (1100)
Call log:
  - <launching> /Users/ikuznetsov/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --disable-updater-scheduler --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/1p/_3cmbf353qzc4kj5hh1j08g80000gn/T/playwright_chromiumdev_profile-eNvYkS --remote-debugging-pipe --no-startup-window
  - <launched> pid=64731
  - [pid=64731][err] [0918/235131.728291:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9
  - [pid=64731][err] [0918/235131.730150:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.
  - [pid=64731][err] [0918/235131.730545:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.
  - [pid=64731][err] [0918/235131.730599:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.64731: Permission denied (1100)
  - [pid=64731] <gracefully close start>
  - [pid=64731] <kill>
  - [pid=64731] <will force kill>
  - [pid=64731] exception while trying to kill process: Error: kill EPERM
  - [pid=64731] <process did exit: exitCode=null, signal=SIGTRAP>
  - [pid=64731] starting temporary directories cleanup
  - [pid=64731] finished temporary directories cleanup
  - [pid=64731] <gracefully close end>

```