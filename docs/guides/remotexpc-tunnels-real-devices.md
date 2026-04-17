---
title: Remote XPC Tunnels
---

Certain features of the XCUITest driver rely on Remote XPC services and IPv6 tunneling. This
functionality is provided by the optional [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc/)
library.

!!! info

    The driver only uses remote XPC tunnels for **real devices running iOS/tvOS 18 or later**.
    Real devices running iOS/tvOS < 18 do not support this tunneling mechanism, whereas
    simulators do not need to use it.

## Why Use Remote XPC

On iOS/tvOS 18+, Apple routes many system services (including XCTest-related ones) over IPv6-only
interfaces and Remote XPC endpoints. The XCUITest driver utilizes them for the following features
(non-exhaustive list):

- General communication with wireless Apple TV devices
- Retrieval of various logs
- Network monitoring
- Certificate management
- Execution of native XCTest test suites

## Prerequisites

- macOS or Linux host
- Real device running iOS/tvOS 18 or later, paired and trusted on its host
    - The driver supports devices connected via `usbmuxd` (wired and wireless), as well as
      wireless tvOS devices (must be paired first, [see section below](#wireless-apple-tv-devices))
- `appium-ios-remotexpc` installed
    - The driver declares this package as an **optional dependency**, so in a normal
      installation npm will install it automatically. You only need to install it manually if
      the optional dependency step failed or you are wiring a custom environment.

To verify that the optional dependency and tunnel infrastructure are available, you can run:

```bash
appium driver doctor xcuitest
```

Look for the optional checks related to `appium-ios-remotexpc` and “tunnel availability”.

## Creating Tunnels

The XCUITest driver exposes a high‑level convenience script that wraps the lower‑level
`appium-ios-remotexpc` tunnel workflow.

!!! warning

    This script must be run as **sudo/root** to create TUN/TAP interfaces for the tunnel.

```bash
sudo appium driver run xcuitest tunnel-creation
```

Refer to [the script reference page](../reference/scripts.md#tunnel-creation) for a list of
additional options.

The script executes the following actions:

- Enumerates all connected and trusted iOS/tvOS devices
    - The list of available devices can also be retrieved using the [`list-real-devices`](../reference/scripts.md#list-real-devices)
      script
- For each device:
    - Starts a Lockdown session
    - Starts `com.apple.internal.devicecompute.CoreDeviceProxy` via Remote XPC
    - Creates an IPv6 tunnel using `TunnelManager.getTunnel(...)`
    - Starts a packet stream server on a local TCP port (default base: `50000`)
- Builds an in‑memory tunnel registry containing:
    - Device UDID and device ID
    - Tunnel IPv6 address (`Address`) and `RsdPort`
    - Packet stream port and basic metadata
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

- Get tunnel for a specific UDID:

    ```bash
    curl http://localhost:<port>/remotexpc/tunnels/<udid>
    ```

The response contains the IPv6 `address`, `rsdPort`, and other metadata required to establish
Remote XPC connections.

## Running Tests

### Wired Devices

1. Start the tunnels (once per host):

    Create a tunnel for each discovered device:

    ```bash
    sudo appium driver run xcuitest tunnel-creation
    ```

    Create a tunnel for a specific device:

    ```bash
    sudo appium driver run xcuitest tunnel-creation -- --udid <udid>
    ```

    Leave this process running in the background while tests execute.

2. Start the Appium server (in a separate terminal):

    ```bash
    appium
    ```

3. Run your tests using standard capabilities:

    ```json
    {
      "platformName": "iOS", // or tvOS, if using Apple TV HD
      "appium:automationName": "XCUITest",
      "appium:platformVersion": "18.4",
      "appium:udid": "<device-udid>",
      ...
    }
    ```

No extra capabilities are required to “enable” tunnels; they are automatically used when:

- `appium-ios-remotexpc` is installed
- the tunnel registry server is reachable
- the platform is a real device running iOS/tvOS 18 or later

### Wireless Apple TV devices

Wireless Apple TV devices running tvOS 18+ must first be paired in order to have them appear in
Xcode / `xcodebuild` as a network device.

1. Pair the Apple TV so that it is registered and has a usable UDID. The driver provides a separate
   script for this purpose:

    ```bash
    sudo appium driver run xcuitest pair-appletv
    ```

    See the [Apple TV pairing guide](remotexpc-apple-tv-pairing.md) for more details.

2. Start the Apple TV tunnel using the UDID returned by the pairing script (step 1):

    ```bash
    sudo appium driver run xcuitest tunnel-creation --appletv-device-id <udid-from-pairing-script>
    ```

3. Start the Appium server (in a separate terminal):

    ```bash
    appium
    ```

4. Run your tests using standard capabilities:

    ```json
    {
      "platformName": "tvOS",
      "appium:automationName": "XCUITest",
      "appium:platformVersion": "26.3",
      "appium:udid": "<appletv-udid>"
    }
    ```

When the Apple TV tunnel is running and registered, the driver uses the tunnel and Remote XPC in the
same way as for USB‑connected devices: no additional capabilities are required beyond providing the
correct `appium:udid`.

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
