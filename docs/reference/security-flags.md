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

|Feature Name|Description|
|------------|-----------|
|`shutdown_other_sims`|Allow any session to use a capability to shutdown any running simulators on the host|
|`perf_record`|Allow recording the system performance and other metrics of the simulator|
|`audio_record`|Allow recording of host audio input(s)|
|`customize_result_bundle_path`|Allow customizing the paths to result bundles, using the `resultBundlePath` capability|
