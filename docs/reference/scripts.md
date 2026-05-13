---
title: Scripts
---

Appium drivers can include scripts for executing specific actions. The scripts included in the
XCUITest driver can be run as follows:

```
appium driver run xcuitest <script-name>
```

For more information about the `appium driver run` command, refer to [the Appium docs](https://appium.io/docs/en/latest/reference/cli/extensions/#run).

!!! note

    Script arguments should be provided after an additional double dash (`--`), to ensure they are
    passed to the script itself, instead of the `appium driver run` command.

### `build-wda`

Builds the WebDriverAgent (WDA) project of the installed XCUITest driver for a simulator device.

#### Usage

```
appium driver run xcuitest build-wda
```

##### Optional Arguments

|<div style="width:6em">Argument</div>|Description|Type|Default|
|--|--|--|--|
|`--name`|Name of the simulator device for which WDA should be built. By default, the first available iPhone simulator is used.|string|`iPhone`|
|`--sdk`|iOS/tvOS version for which WDA should be built. By default, the latest installed iPhone SDK is used (note that this may be different from the latest installed simulator OS version).|string|Result of `xcrun --sdk iphonesimulator --show-sdk-version`|
|`--help`, `-h`|Return help text and exit|||

#### Examples

- Build WebDriverAgentRunner for the first iPhone simulator using the latest installed SDK:

    ```
    appium driver run xcuitest build-wda
    ```

- Build WebDriverAgentRunner for an iPhone 15 simulator with iOS 17.5:

    ```
    appium driver run xcuitest build-wda -- --sdk=17.5 --name="iPhone 15"
    ```


### `cleanup-videos`

Deletes old video recording files created via [`mobile: startXCTestScreenRecording`](./execute-methods.md#mobile-startxctestscreenrecording).
Only supported for real devices running iOS 18+.

While `mobile: stopXCTestScreenRecording` does support automatic deletion of the recorded video
for iOS 18+, this script is complementary and can be used to delete previously recorded videos, or
if automatic deletion failed for any reason.

!!! note

    This script requires the [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc)
    package to be installed, as well as a running RemoteXPC tunnel (which can be created using the
    [`tunnel-creation`](#tunnel-creation) script)

#### Usage

```
appium driver run xcuitest cleanup-videos -- --udid=<udid>
```

|Argument|Description|Type|
|--|--|--|
|`--udid`|Identifier of the target device|string|

##### Optional Arguments

|Argument|Description|Type|Default|
|--|--|--|--|
|`--dry-run`|List the discovered video recording file UUIDs without deletion|boolean|`false`|

#### Examples

- Delete all XCTest recording files for the device with UDID `00000000-1111-2222-3333-444444444444`:

    ```
    appium driver run xcuitest cleanup-videos -- --udid=00000000-1111-2222-3333-444444444444
    ```

- List all XCTest recording file UUIDs for the device with UDID `00000000-1111-2222-3333-444444444444`:

    ```
    appium driver run xcuitest cleanup-videos -- --udid=00000000-1111-2222-3333-444444444444 --dry-run
    ```


### `download-wda`

Downloads a prebuilt WebDriverAgent (WDA) application from the WDA project's [GitHub Releases page](https://github.com/appium/WebDriverAgent/releases)
for use with real devices or simulators.

For information about running tests with a prebuilt WDA application, [refer to this guide](../guides/run-prebuilt-wda.md).

#### Usage

```
appium driver run xcuitest download-wda -- --outdir=<outdir> --platform=<platform> --kind=<real|sim>
```

|<div style="width:6em">Argument</div>|Description|Type|Default|
|--|--|--|--|
|`--outdir`|Target directory where the WDA app should be downloaded. The directory must not exist. Relative paths are resolved starting from the XCUITest driver install directory.|string| - |
|`--platform`|Target platform of the WDA app. Supported values are `ios` and `tvos` (case-insensitive)|string| - |
|`--kind`|Kind of the WDA app to download. Supported values are `real` and `sim`.|string|`real`|

##### Optional Arguments

|Argument|Description|
|--|--|
|`--help`, `-h`|Return help text and exit|

#### Examples

- Download the iOS version of the WDA app (`WebDriverAgentRunner-Runner.app`) into the `wda`
    subdirectory of the XCUITest driver's install directory:

        ```
        appium driver run xcuitest download-wda -- --platform=ios --outdir=wda
        ```

- Download the tvOS version of the WDA app (`WebDriverAgentRunner_tvOS-Runner.app`) into `/path/to/dir`:

        ```
        appium driver run xcuitest download-wda -- --platform=tvos --outdir=/path/to/dir
        ```


### `download-wda-sim`

**Deprecated in favor of `download-wda`; use `download-wda` with the appropriate build kind for simulator or real-device usage.**

Downloads a prebuilt WebDriverAgent (WDA) application from the WDA project's [GitHub Releases page](https://github.com/appium/WebDriverAgent/releases)
for use in a simulator device.

For information about running tests with a prebuilt WDA application, [refer to this guide](../guides/run-prebuilt-wda.md).

#### Usage

```
appium driver run xcuitest download-wda-sim -- --outdir=<outdir> --platform=<platform>
```

|<div style="width:6em">Argument</div>|Description|Type|
|--|--|--|
|`--outdir`|Target directory where the WDA app should be downloaded. The directory must not exist. Relative paths are resolved starting from the XCUITest driver install directory.|string|
|`--platform`|Target platform of the WDA app. Supported values are `ios` and `tvos` (case-insensitive)|string|

##### Optional Arguments

|Argument|Description|
|--|--|
|`--help`, `-h`|Return help text and exit|

#### Examples

- Download the iOS version of the WDA app (`WebDriverAgentRunner-Runner.app`) into the `wda`
  subdirectory of the XCUITest driver's install directory:

    ```
    appium driver run xcuitest download-wda-sim -- --platform=ios --outdir=wda
    ```

- Download the tvOS version of the WDA app (`WebDriverAgentRunner_tvOS-Runner.app`) into `/path/to/dir`:

    ```
    appium driver run xcuitest download-wda-sim -- --platform=tvos --outdir=/path/to/dir
    ```


### `sign-wda`

Signs or inspects a downloaded WebDriverAgent (WDA) app bundle using
[`resigner`](https://github.com/appium/resigner).
The `resigner` tool must be available on your `PATH`.

By default, it signs the app using a `.p12` certificate and provisioning profiles. With
`--inspect`, it runs inspect-only mode and prints bundle/signing details without modifying the app.

#### Generating or Using a Certificate

Before signing, you need a signing certificate. You can use certificates in two ways:

**Option 1: Use `.cer` and `.key` files directly (recommended — no password needed!)**

If you've downloaded a `.cer` (certificate) and `.key` (private key) file from the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list), you can use them directly without conversion. The script automatically converts them to a temporary `.p12` file with an auto-generated password — **no need to manage a password yourself!**

```bash
appium driver run xcuitest sign-wda -- \
  --wda-path ./wda/WebDriverAgentRunner-Runner.app \
  --p12-cert ~/certificate.cer \
  --p12-key ~/private.key
```

**Option 2: Create a `.p12` file from Keychain (macOS — requires P12_PASSWORD)**

If your certificate is in your macOS Keychain:

1. Open **Keychain Access** → **My Certificates**.
2. Find your iOS development or distribution certificate (e.g. `Apple Development: ...`).
3. Right-click → **Export** → choose **Personal Information Exchange (.p12)**.
4. Set a password — this becomes your `P12_PASSWORD` environment variable.

Then use it with:

```bash
P12_PASSWORD=mypassword appium driver run xcuitest sign-wda -- \
  --wda-path ./wda/WebDriverAgentRunner-Runner.app \
  --p12-file ~/sign.p12
```

**Option 3: Manually convert `.cer` and `.key` to `.p12` (requires P12_PASSWORD)**

If you prefer to create a `.p12` file manually:

```bash
# Convert Apple-issued .cer to .pem
openssl x509 -in certificate.cer -inform DER -out certificate.pem

# Combine certificate and private key into a .p12
openssl pkcs12 -export \
  -in certificate.pem \
  -inkey private.key \
  -out sign.p12 \
  -passout pass:mypassword
```

Then use the `.p12` file as in Option 2 with `P12_PASSWORD` environment variable.

!!! note "Certificate Options"

    The script supports two mutually exclusive approaches:

    - **`--p12-cert` + `--p12-key`** (recommended): Automatically converts `.cer` and `.key` files to a temporary `.p12` with an auto-generated password. **No `P12_PASSWORD` needed!**
    - **`--p12-file`**: Uses a preconverted `.p12` file. **Requires `P12_PASSWORD` environment variable.**

    Choose one approach; you cannot use both in the same command.

#### Usage

```
P12_PASSWORD=<password> appium driver run xcuitest sign-wda -- --wda-path=<path> --p12-file=<path>
```

#### Usage (inspect-only)

```
appium driver run xcuitest sign-wda -- --wda-path=<path> --inspect
```

##### Required Arguments

|Argument|Description|Type|
|--|--|--|
|`--wda-path`|Path to the `WebDriverAgentRunner-Runner.app` bundle to sign|string|

##### Optional Arguments

|Argument|Description|Type|
|--|--|--|
|`--p12-file`|Path to the `.p12` signing certificate file. **Mutually exclusive with `--p12-cert` and `--p12-key`.** Requires `P12_PASSWORD` environment variable.|string|
|`--p12-cert`|Path to the `.cer` certificate file from Apple Developer portal. **Mutually exclusive with `--p12-file`.** Auto-converts to `.p12` with generated password (no `P12_PASSWORD` needed). Must be used with `--p12-key`.|string|
|`--p12-key`|Path to the `.key` private key file from Apple Developer portal. **Mutually exclusive with `--p12-file`.** Auto-converts to `.p12` with generated password (no `P12_PASSWORD` needed). Must be used with `--p12-cert`.|string|
|`--profile-dir`|Directory containing provisioning profiles (`.mobileprovision` files.) Default is auto-discovered from default locations `~/Library/Developer/Xcode/UserData/Provisioning Profiles` and `~/Library/MobileDevice/Provisioning Profiles`.|string|
|`--bundle-id`|Remap the default WebDriverAgent bundle IDs with the specified bundle ID. It is useful when your provisioning profile is tied to a specific bundle ID.|string|
|`--inspect`|Run `resigner --inspect` only. In this mode, signing options (`--p12-file`, `--p12-cert`/`--p12-key`, `P12_PASSWORD`, `--profile-dir`) are not required.|boolean|

##### Environment Variables
|Variable|Description|
|--|--|
|`P12_PASSWORD`|Password for the `.p12` signing certificate file. **Required only when using `--p12-file`**. Not needed when using `--p12-cert` and `--p12-key` (which auto-generate a password).|

#### Examples

- Sign WDA with `.p12` certificate (requires P12_PASSWORD):

    ```
    P12_PASSWORD=mypassword appium driver run xcuitest sign-wda -- \
      --wda-path=./wda/WebDriverAgentRunner-Runner.app \
      --p12-file=~/sign.p12 \
      --bundle-id=com.example.wda
    ```

- Sign WDA with `.cer` and `.key` files (no password needed — auto-converted!):

    ```
    appium driver run xcuitest sign-wda -- \
      --wda-path=./wda/WebDriverAgentRunner-Runner.app \
      --p12-cert=~/certificate.cer \
      --p12-key=~/private.key
    ```

- Sign WDA with `.cer` and `.key` files and remap bundle ID:

    ```
    appium driver run xcuitest sign-wda -- \
      --wda-path=./wda/WebDriverAgentRunner-Runner.app \
      --p12-cert=~/certificate.cer \
      --p12-key=~/private.key \
      --bundle-id=com.example.wda
    ```

- Sign WDA with specified provisioning profile directory (cert+key approach):

    ```
    appium driver run xcuitest sign-wda -- \
      --wda-path=./wda/WebDriverAgentRunner-Runner.app \
      --p12-cert=~/certificate.cer \
      --p12-key=~/private.key \
      --profile-dir=/path/to/provisioning/profiles
    ```

- Inspect a WDA app without signing:

    ```
    appium driver run xcuitest sign-wda -- \
        --wda-path=./wda/WebDriverAgentRunner-Runner.app \
        --inspect
    ```


### `image-mounter`

Mounts or unmounts a Developer Disk Image (DDI) on an iOS device to unlock additional development
features. The script provides the `mount` and `unmount` sub-commands, and returns help text when
run with no subcommand.

#### Usage (no subcommand)

```
appium driver run xcuitest image-mounter
```

##### Optional Arguments

|Argument|Description|
|--|--|
|`--version`, `-V`|Return the script version and exit|
|`--help`, `-h`|Return help text and exit|

#### Usage (`mount` subcommand)

```
appium driver run xcuitest image-mounter mount -- --image=<image> --manifest=<manifest> --trustcache=<trustcache>
```

|Argument|Description|Type|
|--|--|--|
|`--image`, `-i`|Path to the developer disk image `.dmg` file|string|
|`--manifest`, `-m`|Path to the `BuildManifest.plist` file|string|
|`--trustcache`, `-t`|Path to the `.trustcache` file|string|

##### Optional Arguments

|<div style="width:6em">Argument</div>|Description|Type|Default|
|--|--|--|--|
|`--udid`, `-u`|Identifier of the target device to mount the image to. By default, the first connected iOS device is used.|string|UDID of the first connected device|


#### Usage (`unmount` subcommand)

```
appium driver run xcuitest image-mounter unmount
```

##### Optional Arguments

|<div style="width:9em">Argument</div>|Description|Type|<div style="width:7em">Default</div>|
|--|--|--|--|
|`--mount-path`, `-p`|Path to unmount|string|`/System/Developer`|
|`--udid`, `-u`|Identifier of the target device to unmount the image from. By default, the first connected iOS device is used.|string|UDID of the first connected device|

#### Examples

- Mount a given image on the first connected device:

    ```
    appium driver run xcuitest image-mounter mount -- --image DeveloperDiskImage.dmg --manifest BuildManifest.plist --trustcache DeveloperDiskImage.trustcache
    ```

- Unmount the image at the default mount path of the device with UDID `00000000-1111-2222-3333-444444444444`:

    ```
    appium driver run xcuitest image-mounter unmount -- --udid 00000000-1111-2222-3333-444444444444
    ```


### `list-real-devices`

Lists all connected real devices. By default, devices are discovered using `usbmuxd`, which finds
both wired _and_ wireless devices, with the exception of wireless tvOS devices, which require using
the `--devicectl` flag.

!!! note

    Device discovery over `usbmuxd` requires the [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc)
    package to be installed.

#### Usage

```
appium driver run xcuitest list-real-devices
```

##### Optional Arguments

|<div style="width:7em">Argument</div>|Description|Type|Default|
|--|--|--|--|
|`--devicectl`|Whether to use the `devicectl` service instead of `usbmuxd` for device discovery. Primarily used for tvOS devices.|boolean|`false`|
|`--connection`|Filter returned devices by connection type. Supported values are `all`, `wired`, and `wireless`|string|`all`|

#### Examples

- List connected devices using `devicectl` (such as tvOS devices):

    ```
    appium driver run xcuitest list-real-devices -- --devicectl
    ```

- List all devices connected over a wired connection:

    ```
    appium driver run xcuitest list-real-devices -- --connection wired
    ```


### `open-wda`

Opens the WebDriverAgent (WDA) project of the installed XCUITest driver in Xcode.

#### Usage

```
appium driver run xcuitest open-wda
```


### `pair-appletv`

Pairs wireless Apple TV devices for use in Remote XPC tunneling, which is used by the driver to
communicate with the device. See [the Remote XPC Tunnels](../guides/remotexpc-tunnels-real-devices.md)
and [tvOS automation](../guides/tvos.md) guides for more details.

!!! note

    This script requires the [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc)
    package to be installed.

!!! note

    This script must be run in `sudo` mode (as root), like [`tunnel-creation`](#tunnel-creation).

#### Usage

```
sudo appium driver run xcuitest pair-appletv
```

##### Optional Arguments

|<div style="width:7em">Argument</div>|Description|Type|
|--|--|--|
|`--device`, `-d`|Selector of the Apple TV device. Can be the device name (`"Living Room"`), UDID (`AA:BB:CC:DD:EE:FF`), or index (`0`). If not provided, a prompt for device selection is shown.|string or integer|
|`--help`, `-h`|Return help text and exit||

#### Examples

- Select a device to pair from a list of discovered devices:

    ```
    sudo appium driver run xcuitest pair-appletv
    ```

- Pair the device with the name "Conference Room":

    ```
    sudo appium driver run xcuitest pair-appletv -- --device "Conference Room"
    ```


### `tunnel-creation`

Creates tunnels for communication with real iOS/tvOS 18+ devices. Apple TV devices must first be
paired using the [`pair-appletv`](#pair-appletv) script.

!!! note

    This script requires the [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc)
    package to be installed.

!!! note

    This script must be run in `sudo` mode. This is because tunnel creation relies on TUN/TAP
    interfaces (via [`appium-ios-tuntap`](https://github.com/appium/appium-ios-tuntap/)), and macOS
    does not allow adding/removing TUN interfaces for non-root users. Xcode/devicectl do not
    require such privileges, because they interact with trusted system services.

#### Usage

```
sudo appium driver run xcuitest tunnel-creation
```

##### Optional Arguments

|<div style="width:14em">Argument</div>|Description|Type|Default|
|--|--|--|--|
|`--appletv-device-id`|Identifier of a paired Apple TV device (returned by [`pair-appletv`](#pair-appletv)) to create the tunnel for. Repeat this argument to target multiple paired Apple TV devices. If omitted, the script creates one tunnel per discovered paired Apple TV device. If this is provided without `--udid`, setup of non-Apple TV devices is skipped.|string (repeatable)||
|`--disconnect-retry-max-attempts`|Maximum number of tunnel recreation attempts after an unexpected disconnect. Set to `0` for unlimited retries. If omitted, retries are disabled and the tunnel is removed from registry.|integer||
|`--disconnect-retry-interval-ms`|Delay between tunnel recreation attempts in milliseconds.|integer|1000|
|`--packet-stream-base-port`|Base port for packet stream servers|integer|50000|
|`--tunnel-registry-port`|Port of the tunnel registry server, hosted at `http://localhost:<port>/remotexpc/tunnels`|integer|42314|
|`--udid`|Identifier of a specific non-Apple TV device to create the tunnel for. Repeat this argument to target multiple specific devices. By default, the tunnel is created for all connected devices. If this is provided without `--appletv-device-id`, Apple TV discovery/setup is skipped.|string (repeatable)||

#### Examples

- Create a tunnel for all connected devices:

    ```
    sudo appium driver run xcuitest tunnel-creation
    ```

- Create a tunnel for all connected devices using custom ports:

    ```
    sudo appium driver run xcuitest tunnel-creation -- --packet-stream-base-port 51000 --tunnel-registry-port 43000
    ```

- Create a tunnel for a device with the UDID `00000000-1111-2222-3333-444444444444`:

    ```
    sudo appium driver run xcuitest tunnel-creation -- --udid 00000000-1111-2222-3333-444444444444
    ```

- Create tunnels for multiple usbmux and AppleTV devices:

    ```
    sudo appium driver run xcuitest tunnel-creation -- --udid 00000000-1111-2222-3333-444444444444 --udid 55555555-6666-7777-8888-999999999999 --appletv-device-id 00000000-5555-9999-7777-444444444444 --appletv-device-id 00000000-2222-9999-1111-444444444444
    ```

- Recreate tunnel up to 10 times on disconnect with 2s interval:

    ```
    sudo appium driver run xcuitest tunnel-creation -- --disconnect-retry-max-attempts 10 --disconnect-retry-interval-ms 2000
    ```
