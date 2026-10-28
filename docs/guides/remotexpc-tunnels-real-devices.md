---
title: Remote XPC Tunnels
---

The XCUITest driver communicates with real devices using Remote XPC services and IPv6 tunneling.
This functionality is provided by the [`appium-ios-remotexpc`](https://github.com/appium/appium-ios/tree/main/packages/remotexpc)
library.

!!! info

    **Running a tunnel is the recommended way to test on real devices.** The driver uses the tunnel
    whenever it is available. Without a tunnel it falls back to the classic lockdown services over
    `usbmux`, which is temporary, limited and expected to stop working once Apple removes these
    services. See [Feature Availability](#feature-availability).

    Tunnels are only supported on ^^real devices running iOS/tvOS 18 or later^^. Real devices running
    iOS/tvOS < 18 always use the `usbmux` fallback, whereas simulators do not need either of them.

## Why Use Remote XPC

On iOS/tvOS 18+, Apple routes many system services (including XCTest-related ones) over IPv6-only
interfaces and Remote XPC endpoints. The XCUITest driver utilizes them for the following features
(non-exhaustive list):

- General communication with wireless Apple TV devices
- General device communication on Windows/Linux hosts
- Retrieval of various logs
- Network monitoring
- Certificate management
- Execution of native XCTest test suites

## Prerequisites

- macOS, Linux or Windows host
- Real device running iOS/tvOS 18 or later, paired and trusted on its host
    - The driver supports devices connected via `usbmuxd` (wired and wireless), as well as
      wireless tvOS devices (must be paired first, [see tvOS guide](./tvos.md#wireless-tvos-18-or-later))
- `appium-ios-remotexpc` installed
    - The driver declares this package as a dependency, so in a normal installation npm will
      install it automatically.
- On Windows hosts, Apple Mobile Device drivers are required. They can be installed through Apple's
  standalone iTunes package for Windows (the non-Microsoft Store installer already bundles them).
- On Linux hosts, it is necessary to load the TUN/TAP kernel module and give the user permissions to
  tun devices:

    ```bash
    # Check if the module is loaded
    lsmod | grep tun

    # If not loaded, load it
    sudo modprobe tun

    # To load it automatically at boot
    echo "tun" | sudo tee -a /etc/modules

    # Add your user to the 'tun' group (if it exists)
    sudo usermod -a -G tun your-username
    ```

    Also, the `ip` command is required for configuring interfaces:

    ```bash
    # Debian/Ubuntu
    sudo apt install iproute2

    # CentOS/RHEL
    sudo yum install iproute

    # Arch Linux
    sudo pacman -S iproute2
    ```

To verify that the dependency and the tunnel infrastructure are available, you can run:

```bash
appium driver doctor xcuitest
```

Look for the check related to `appium-ios-remotexpc` and the optional “tunnel availability” check.

## Feature Availability

The driver decides **once per session** how it talks to the device: through the tunnel if it is
available when the session starts, otherwise through the temporary `usbmux` fallback. The decision is
not revisited if a tunnel starts or stops later. The driver logs a warning when a session runs on the
fallback.

| Works without a tunnel (temporary `usbmux` fallback) | Needs a tunnel |
| --- | --- |
| Device discovery, OS version, `mobile: deviceInfo`, device time | Crash reports |
| WDA and MJPEG port forwarding; WDA launched via `xcodebuild` or prebuilt (macOS) and all WDA-backed commands | HID events (`mobile: performIndigoHidEvent`) |
| App install/uninstall/list, including the streaming `zip_conduit` install | XCTest runs, listing and installing test bundles, attachment cleanup |
| File transfer (AFC) and app container access | Network and system monitors, condition inducer |
| Syslog, install notifications | Launching a preinstalled WDA (`usePreinstalledWDA`) on iOS/tvOS 27+ |
| Certificates, advanced battery information | |
| Webviews and Safari | |

Features from the right column fail with an error that suggests starting a tunnel. Everything also
works through the tunnel, which is the preferred path.

## Creating Tunnels

The XCUITest driver exposes a high‑level convenience script that wraps the lower‑level
`appium-ios-remotexpc` tunnel workflow.

!!! warning

    This script must be run as **sudo/root** to create TUN/TAP interfaces for the tunnel.

```bash
sudo appium driver run xcuitest tunnel-creation
```

Refer to [the script reference page](../reference/scripts.md#tunnel-creation) for a list of
additional options. If wireless Apple TV devices are slow to appear, increase the discovery
window with `--appletv-discovery-timeout-ms`.

The script executes the following actions:

- Enumerates all connected and trusted iOS/tvOS devices
    - The list of available devices can also be retrieved using the [`list-real-devices`](../reference/scripts.md#list-real-devices)
      script
- For each device:
    - Starts a Lockdown session
    - Starts `com.apple.internal.devicecompute.CoreDeviceProxy`
    - Creates an IPv6 tunnel using `TunnelManager.getTunnel(...)` (or `getTunnelPsk` for Apple TV)
    - Discovers RSD services and publishes a service catalog in the tunnel registry
- Builds a tunnel registry containing:
    - Device UDID and device ID
    - Tunnel IPv6 address (`Address`) and `RsdPort`
    - RSD service catalog (`services`) and basic metadata
- Starts an HTTP tunnel registry API server and prints its address
- Persists the chosen registry port in a per‑driver strongbox entry so that the driver can find it

### Inspecting the Tunnel Registry

After a successful script execution, you should see log lines similar to:

```text
📁 Tunnel registry API:
   The tunnel registry is now available through the API at:
   http://localhost:<port>/remotexpc/tunnels
```

You can now use the registry endpoints to retrieve tunnel information:

- List all tunnels:

    ```bash
    curl http://localhost:<port>/remotexpc/tunnels
    ```

- Get tunnel for a specific UDID (long-poll until the RSD catalog is ready):

    ```bash
    curl "http://localhost:<port>/remotexpc/tunnels/<udid>?waitMs=15000"
    ```

- Re-discover the RSD service catalog after a Developer Disk Image mount:

    ```bash
    curl -X POST "http://localhost:<port>/remotexpc/tunnels/<udid>/refresh-services"
    ```

The response contains the IPv6 `address`, `rsdPort`, `services` catalog, and other metadata required to establish
Remote XPC connections.

## Running Tests

Make sure to create all required tunnel(s) _before_ launching your tests. The tunnel process(es)
should remaing running in the background, _in addition to_ the Appium server process.

No extra capabilities are required to "enable" tunnels; they are automatically used when:

- the tunnel registry server is reachable when the session starts
- the platform is a real device running iOS/tvOS 18 or later

Otherwise the session continues on the [`usbmux` fallback](#feature-availability).

Refer to [the Non-macOS Hosts guide](./non-macos-hosts.md) for additional requirements in order to
run sessions on Windows/Linux hosts.

### Multiple Sessions

The tunnel creation script is multi‑device aware: it creates and registers an independent tunnel
for each connected device. It can also be limited to specific devices by passing `--udid`/`--appletv-device-id`
multiple times. The driver can then run multiple sessions concurrently on a single Appium server
as long as:

- Each session uses a different real device (`appium:udid` is unique per session)
- The tunnels for all those devices are present in the tunnel registry

If you frequently add/remove devices, consider occasionally re‑running the tunnel script to refresh
the registry, or use the `--disconnect-retry-max-attempts`/`--disconnect-retry-interval-ms` options
to configure automatic reconnection.

### Multiple Appium Servers

Since the tunnel registry server is running in a separate process, it is not linked to a specific
Appium server instance, and can be used by multiple Appium servers simultaneously. To ensure that
all Appium server instances discover the same tunnel registry, you can set a specific port:

```bash
sudo appium driver run xcuitest tunnel-creation --tunnel-registry-port 43000
```

Similarly to running multiple sessions on a single server, make sure that each session uses
a different device UDID.

In more advanced setups (e.g., Docker, multiple hosts, CI agents), you may want to run one
tunnel‑creation process per container/VM. In such cases, use distinct `--tunnel-registry-port`
values for each isolation boundary. This keeps tunnel state scoped to each environment, but within
that boundary you should still avoid running multiple competing tunnel‑creation scripts
simultaneously, as they may fight over TUN/TAP configuration and `usbmuxd` connections.
