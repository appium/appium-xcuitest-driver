---
hide:
  - toc

title: Security Feature Flags
---

Some insecure driver features are disabled by default. They can be enabled upon launching Appium as follows:
```
appium --allow-insecure <feature-name>
```
or
```
appium --relaxed-security
```

|Feature Name|Description|
|------------|-----------|
|`shutdown_other_sims`|Allow any session to use a capability to shutdown any running simulators on the host|
|`perf_record`|Allow recording the system performance and other metrics of the simulator|
|`audio_record`|Allow recording of host audio input(s)|
|`customize_result_bundle_path`|Allow customizing the paths to result bundles, using the `resultBundlePath` capability|
