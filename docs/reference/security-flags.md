---
hide:
  - toc

title: Insecure Features
---

Some [insecure driver features](https://appium.io/docs/en/latest/guides/security/) are disabled by
default. They can be enabled upon launching Appium as follows:
```
appium --allow-insecure xcuitest:<feature-name>
```
or
```
appium --relaxed-security
```

For other insecure feature names recognized by the Appium server, see
[their Appium docs reference page](https://appium.io/docs/en/latest/reference/cli/insecure-features/).

|<div style="width:15em">Feature Name</div>|Description|
|------------|-----------|
|`audio_record`|Allow recording of host audio input(s) using [`mobile: startAudioRecording`](./execute-methods.md#mobile-startaudiorecording)|
|`customize_result_bundle_path`|Allow customizing paths to result bundles using the `appium:resultBundlePath` capability|
|`get_server_logs`|Allow retrieving Appium server logs using [the `getLogEvents` endpoint](https://appium.io/docs/en/latest/reference/api/appium/#getlogevents)|
|`perf_record`|Allow recording system performance and other metrics using [`mobile: startPerfRecord`](./execute-methods.md#mobile-startperfrecord). Only required for simulators.|
|`shutdown_other_sims`|Allow shutdown of any running simulators on the host using the `appium:shutdownOtherSimulators` capability|
|`xctest_record_screen`|Allow screen recording via XCTest using [`mobile: startXCTestScreenRecording`](./execute-methods.md#mobile-startxctestscreenrecording). Only required for real devices due to the inability to programmatically delete the recorded videos.|
