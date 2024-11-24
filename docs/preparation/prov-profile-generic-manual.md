---
hide:
  - toc

title: Manual Configuration for a Generic Device
---

It is possible to build `WebDriverAgentRunner` for a generic iOS/iPadOS/tvOS device, and install the
generated `.app` package to a real device.

```bash
# iOS/iPadOS
$ xcodebuild clean build-for-testing -project WebDriverAgent.xcodeproj -derivedDataPath appium_wda_ios -scheme WebDriverAgentRunner -destination generic/platform=iOS CODE_SIGNING_ALLOWED=YES

# tvOS
$ xcodebuild clean build-for-testing -project WebDriverAgent.xcodeproj -derivedDataPath appium_wda_tvos -scheme WebDriverAgentRunner_tvOS -destination generic/platform=tvOS CODE_SIGNING_ALLOWED=YES
```

On successful completion the resulting package `WebDriverAgentRunner-Runner.app` should be located
in the `Build/Products/Debug-iphoneos/` subfolder under WebDriverAgent sources root, or in the path
provided as `derivedDataPath` argument.

!!! note

    If the build fails, please make sure `WebDriverAgent.xcodeproj` has codesigning properties
    configured properly. For example, you may need to change the bundle id for the provisioning profile.

The `WebDriverAgentRunner-Runner.app` can now be installed to any real device as allowed by the
provisioning profile.

You can install the package with 3rd party tools and manage it separately as explained in
[How To Set Up And Customize WebDriverAgent Server](../guides/wda-custom-server.md). Note that if
the codesigning was not correct, the installation will fail.

As a more advanced method, you can generate the package with `CODE_SIGNING_ALLOWED=NO` and do
[`codesign`](https://developer.apple.com/documentation/xcode/using-the-latest-code-signature-format)
by yourself. This would make the device management more flexible, but you would need to know about
advanced codesign usage scenarios.

!!! note

    The Appium team distributes generic builds with `CODE_SIGNING_ALLOWED=NO` at
    [WebDriverAgent package releases](https://github.com/appium/WebDriverAgent/releases).
    It is recommended to sign packages with a wildcard (`*`) provisioning profile,
    although such profiles require a paid Apple Developer account.
    For example, if you're preparing such a provisioning profile for `io.appium.WebDriverAgentRunner.xctrunner`, it will be for `io.appium.*`, `io.appium.WebDriverAgentRunner.*` or `*`.
    In case of a free account, you may need to update the bundle id before building
    the WebDriverAgent package to prepare a properly signed WebDriverAgent package
    by `xcodebuild`.
