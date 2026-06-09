---
title: Manual Configuration for a Generic Device
---

It is possible to use a version of `WebDriverAgentRunner` built for a generic iOS/iPadOS/tvOS
device, and install the generated `.app` package to a real device.

## Building WDA Yourself

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

As a more advanced method, you can generate the package with `CODE_SIGNING_ALLOWED=NO`, then
manually codesign it as described in the [Signing WDA](#signing-wda) section.

You can now use third-party tools to install and manage `WebDriverAgentRunner-Runner.app` as
explained in [the WDA Custom Server guide](../../guides/wda-custom-server.md). Note that if the
codesigning was not correct, the installation will fail.

## Using Appium-Provided Prebuilt WDA

The Appium team distributes generic builds with `CODE_SIGNING_ALLOWED=NO` at
[WebDriverAgent package releases](https://github.com/appium/WebDriverAgent/releases). These builds
must be codesigned first, after which they can be installed as described in the previous section.

## Signing WDA

In most cases, Xcode will automatically codesign your WDA package if you have a valid provisioning
profile. It is recommended to sign packages with a wildcard (`*`) provisioning profile, although
such profiles require a paid Apple Developer account. For example, if you're preparing such a
provisioning profile for `io.appium.WebDriverAgentRunner.xctrunner`, it will be for `io.appium.*`,
`io.appium.WebDriverAgentRunner.*` or `*`.

In case of a free account or paid account without `*` provisioning profile, you may need to update
the bundle id before building so `xcodebuild` can produce a properly signed WebDriverAgent package.

For WDA packages built with `CODE_SIGNING_ALLOWED=NO`, manual signing is possible using the macOS
[`codesign` utility](https://developer.apple.com/documentation/xcode/using-the-latest-code-signature-format).

Another option is to use the [`sign-wda` driver script](../../reference/scripts.md#sign-wda) to
re-sign an existing package and remap its bundle ids. The script itself is based on the
[`resigner` tool](https://github.com/appium/resigner), which can remap the bundle ids to values
allowed by the free provisioning profile and then sign the package with that profile.
