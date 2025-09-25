---
hide:
  - toc

title: Scripts
---

Appium drivers can include scripts for executing specific actions. The following table lists the
scripts bundled with the XCUITest driver. These scripts can be run as follows:

```
appium driver run xcuitest <script-name>
```

|Script Name|Description|
|------------|-----------|
|`open-wda`|Opens the WebDriverAgent project in Xcode|
|`build-wda`|Builds the WebDriverAgent project using the first available iPhone simulator and the latest iOS supported by the current Xcode version by default|
|`build-wda --sdk=17.5 --name="iPhone 15"`|Builds the WebDriverAgent project using the iPhone 15 simulator with iOS 17.5. If `--sdk` and `--name` params are not specified - the latest iOS and the first available iPhone simulator will be used|
|`tunnel-creation`|Creates tunnels for connected iOS devices, starts CoreDeviceProxy, and sets up a tunnel registry server. Requires sudo access to communicate with iOS devices|
|`tunnel-creation --udid=<device-udid>` or `-u <device-udid>`|Creates a tunnel for a specific iOS device with the given UDID|
|`tunnel-creation --packet-stream-base-port=<port>`|Specifies the base port for packet stream servers (default: 50000)|
|`tunnel-creation --tunnel-registry-port=<port>`|Specifies the port for the tunnel registry server (default: 42314)|
|`download-wda-sim --outdir=/path/to/dir`|Download corresponding version's prebuilt WDA for iOS matched with the host machine architecture from [GitHub WebDriver release page](https://github.com/appium/WebDriverAgent/releases) into `--outdir` directory. The downloaded package name will be `WebDriverAgentRunner-Runner.app`.|
|`download-wda-sim --platform=tvos --outdir=/path/to/dir`|Download corresponding version's prebuilt WDA for `--platform` into `--outdir` directory. If `--platform=tvos` is provided, the download module will be for tvOS (`WebDriverAgentRunner_tvOS-Runner.app`), otherwise the command will download iOS.|
|`image-mounter mount --image <path> --manifest <path> --trustcache <path>`|Mount a Personalized Developer Disk Image on an iOS device. Requires paths to the .dmg image file, BuildManifest.plist, and .trustcache file. Requires the `appium-ios-remotexpc` optional dependency.|
|`image-mounter mount --image <path> --manifest <path> --trustcache <path> --udid <device-udid>`|Mount a Developer Disk Image on a specific iOS device with the given UDID|
|`image-mounter unmount`|Unmount a Developer Disk Image from the first available iOS device (default mount path: `/System/Developer`)|
|`image-mounter unmount --udid <device-udid>`|Unmount a Developer Disk Image from a specific iOS device with the given UDID|
