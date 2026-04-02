---
title: Remote XPC Tunnels
---

The XCUITest driver can use **Remote XPC** (via `appium-ios-remotexpc`) and an IPv6 tunnel to talk to
real iOS and tvOS devices on **OS version 18 or newer**. This guide explains how to:

- Create and inspect tunnels using the `tunnel-creation` script
- Run tests against real devices using those tunnels
- Plan parallel test runs when using a single Appium server or multiple servers

This guide applies to **real iOS/tvOS devices only**. Simulators do not use this tunnel mechanism.

Starting with tvOS 18, the tunnel workflow also supports **wireless Apple TV / tvOS devices** when
used together with `appium-ios-remotexpc`'s Apple TV tunnel support. The sections below describe
both USB‑connected iOS/tvOS devices and wireless Apple TV setups.

## When you need tunnels and Remote XPC

On iOS/tvOS 18+ Apple routes many system services (including XCTest-related ones) over IPv6-only
interfaces and Remote XPC endpoints. The XCUITest driver uses:

- `appium-ios-remotexpc` for:
    - Device lockdown / USBMUX communication
    - CoreDeviceProxy and Remote XPC connections
    - High‑level services (installation proxy, AFC, crash reports, DVT instruments, etc.)
- `appium-ios-tuntap` (used internally by `appium-ios-remotexpc`) to:
    - Create a TUN/TAP virtual network interface
    - Establish an IPv6 tunnel between the host and the device

For iOS/tvOS < 18 these tunnels are not required and the driver falls back to legacy transport.

## Prerequisites

- **Host OS**:
    - macOS or Linux (tunnels rely on TUN/TAP support)
- **Node.js / Appium**:
    - Node.js compatible with this driver version (see `package.json` or README)
    - Appium 3.x
- **Device setup**:
    - Real iOS or tvOS device on **18.x or newer**
    - Device paired and trusted on the host
    - Developer tools and Xcode installed (for general iOS development and pairing)
- **Optional dependency (required for tunnels)**:
    - The driver declares `appium-ios-remotexpc` as an **optional dependency**, so in a normal
        installation npm will install it automatically. You only need to install it manually if
        the optional dependency step failed or you are wiring a custom environment.
    - For details about Remote XPC and IPv6 tunneling, see the
        [`appium-ios-remotexpc` README](https://github.com/appium/appium-ios-remotexpc).

- **Privileges**:
    - **sudo/root is required** to create TUN/TAP interfaces for the tunnel. You should generally run
        the tunnel script with `sudo` (or an equivalent mechanism, such as a root container).

To verify that the optional dependency and tunnel infrastructure are available you can run:

```bash
appium driver doctor xcuitest
```

Look for the optional checks related to `appium-ios-remotexpc` and “tunnel availability”.

## Creating tunnels with the driver script

The XCUITest driver exposes a high‑level convenience script that wraps the lower‑level
`appium-ios-remotexpc` tunnel workflow:

```bash
sudo appium driver run xcuitest tunnel-creation
```

This script:

- Connects to `usbmuxd` and enumerates all connected, trusted iOS/tvOS devices
- For each device:
    - Starts a Lockdown session
    - Starts `com.apple.internal.devicecompute.CoreDeviceProxy` via Remote XPC
    - Creates an IPv6 tunnel using `TunnelManager.getTunnel(...)`
    - Starts a packet stream server on a local TCP port (default base: `50000`)
- Builds an in‑memory **tunnel registry** containing:
    - Device UDID and device ID
    - Tunnel IPv6 address (`Address`) and `RsdPort`
    - Packet stream port and basic metadata
- Starts an HTTP **tunnel registry API server** and prints its address
- Persists the chosen registry port in a per‑driver strongbox entry so that the driver can find it

### Command-line options

The script supports a few options:

- **Target a specific device**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation --udid <device-udid>
    ```

- **Customize packet stream base port**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation --packet-stream-base-port 52000
    ```

    The script will assign `52000`, `52001`, `52002`, … to packet stream servers for each device.

- **Customize tunnel registry port**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation --tunnel-registry-port 43000
    ```

    The registry API will then be available at:

    - `http://localhost:43000/remotexpc/tunnels`

    The script also stores the chosen port in a strongbox entry for the `appium-xcuitest-driver`
    package so that driver instances can locate the registry automatically.

- **Enable retries after unexpected disconnects**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation -- --disconnect-retry-max-attempts 5 --disconnect-retry-interval-ms 1000
    ```

    - If `--disconnect-retry-max-attempts` is omitted, retries are disabled and a lost tunnel is
      removed from the registry API.
    - Set `--disconnect-retry-max-attempts 0` for unlimited retries.
    - `--disconnect-retry-interval-ms` controls delay between attempts and defaults to `1000`.

### Inspecting the tunnel registry

After a successful run you should see log lines similar to:

```text
📁 Tunnel registry API:
   The tunnel registry is now available through the API at:
   http://localhost:<port>/remotexpc/tunnels
   ...
   curl http://localhost:<port>/remotexpc/tunnels/<udid>
```

Useful endpoints:

- **List all tunnels**:

    ```bash
    curl http://localhost:<port>/remotexpc/tunnels
    ```

- **Get tunnel for a specific UDID**:

    ```bash
    curl http://localhost:<port>/remotexpc/tunnels/<udid>
    ```

The response contains the IPv6 `address`, `rsdPort`, and other metadata required to establish
Remote XPC connections.

## Running tests on a single Appium server

Once tunnels are running, you can start a standard Appium server with the XCUITest driver and run
tests against iOS/tvOS 18+ real devices using normal capabilities.

### Recommended workflow

1. **Start the tunnels (once per host)**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation
    ```

    Leave this process running in the background while tests execute.

2. **Start the Appium server** (in a separate terminal):

    ```bash
    appium
    ```

3. **Run your tests** using standard XCUITest capabilities:

    ```json
    {
      "platformName": "iOS",
      "appium:automationName": "XCUITest",
      "appium:platformVersion": "18.4",
      "appium:udid": "<device-udid>",
    }
    ```

    For tvOS, set `"platformName": "tvOS"` and use the UDID of your Apple TV device.

4. **How the driver uses tunnels**:

    - When `platformVersion` is **18 or higher** on a **real device**, the driver:
        - Automatically imports `appium-ios-remotexpc` (via `getRemoteXPCServices`)
        - Uses Remote XPC services (installation proxy, AFC, diagnostics, DVT instruments, etc.)
            instead of the legacy paths
        - Relies on the IPv6 tunnels created by the tunnel registry for connectivity
    - If `appium-ios-remotexpc` is missing or tunnels are not available, some advanced real‑device
        features for 18+ may be unavailable or will fall back to slower/less reliable code paths.

No extra capabilities are required to “enable” tunnels; they are automatically used when:

- `appium-ios-remotexpc` is installed, **and**
- the tunnel registry server is reachable, **and**
- the platform is iOS/tvOS 18+ on a real device.

### Wireless Apple TV / tvOS devices

For **wireless Apple TV** running tvOS 18+ you can run tests over Remote XPC tunnels without a USB
cable, as long as the device has been paired and appears in Xcode / `xcodebuild` as a network
device.

High‑level workflow:

1. **Pair the Apple TV using the driver’s pairing script** so that it is registered and has a usable UDID.
    See the [Apple TV pairing guide](remotexpc-apple-tv-pairing.md) for details. In short:

    ```bash
    sudo appium driver run xcuitest pair-appletv
    ```

    This script configures the Apple TV pairing state for use with `appium-ios-remotexpc` and the tunnel
    services.

2. **Start the Apple TV tunnel** using the same tunnel‑creation script the driver uses for USB devices.
    Use the UDID that the pairing script (step 1) printed:

    ```bash
    sudo appium driver run xcuitest tunnel-creation --appletv-device-id <udid-from-pairing-script>
    ```

    This will:
    - establish a Remote XPC tunnel to the Apple TV over the network
    - register the Apple TV tunnel in the same tunnel registry used by the `tunnel-creation` script

3. **Start the Appium server** in a separate terminal (leave the tunnel script from step 2 running):

    ```bash
    appium
    ```

4. **Run your tvOS tests** using the Apple TV UDID:

    ```json
    {
      "platformName": "tvOS",
      "appium:automationName": "XCUITest",
      "appium:platformVersion": "26.3",
      "appium:udid": "<appletv-udid>",
      "appium:app": "/path/to/tvos/app.app"
    }
    ```

When the Apple TV tunnel is running and registered, the driver uses the tunnel and Remote XPC in the
same way as for USB‑connected devices: no additional capabilities are required beyond providing the
correct `appium:udid`.

## Parallel tests with a single Appium server

The tunnel creation script is **multi‑device aware**: it creates and registers an independent tunnel
for each connected device. XCUITest can then run multiple sessions concurrently on a **single**
Appium server as long as:

- Each session uses a **different real device** (`appium:udid` is unique per session)
- The tunnels for all those devices are present in the tunnel registry

### Example: single server, multiple devices

1. **Create tunnels for all connected devices**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation
    ```

2. **Start one Appium server**:

    ```bash
    appium --port 4723
    ```

3. **Run tests in parallel**, for example:

    - Session A:

        ```json
        {
          "platformName": "iOS",
          "appium:automationName": "XCUITest",
          "appium:platformVersion": "18.1",
          "appium:udid": "<iphone-udid>",
          "appium:app": "/path/to/iphone/app.app"
        }
        ```

    - Session B:

        ```json
        {
          "platformName": "tvOS",
          "appium:automationName": "XCUITest",
          "appium:platformVersion": "18.0",
          "appium:udid": "<appletv-udid>",
          "appium:app": "/path/to/tvos/app.app"
        }
        ```

4. **Driver behavior**:

    - Each session uses the UDID to pick the appropriate tunnel from the registry.
    - Underneath, `TunnelManager` maintains a registry of active tunnels and Remote XPC connections
        keyed by tunnel address and reuses them when possible.
    - Packet stream servers created by the tunnel script are already bound to distinct TCP ports, so
        traffic for different devices is isolated.

### Guidelines for single‑server parallelism

- **Do not share a UDID across concurrent sessions** on the same server; use one session per device.
- Ensure the **tunnel script is running before** starting parallel tests so that the registry is
    populated.
- If you frequently add/remove devices, re‑run the tunnel script to refresh the registry.

## Parallel tests with multiple Appium servers

You can also run multiple Appium servers in parallel on the same host while **sharing a single
tunnel registry** and tunnel process.

### Recommended pattern: one tunnel process, many servers

1. **Start a single global tunnel process**:

    ```bash
    sudo appium driver run xcuitest tunnel-creation --tunnel-registry-port 43000
    ```

    - Leave this running in the background.
    - It creates tunnels for all currently connected devices and exposes the registry on `43000`.
    - The registry port is persisted in a strongbox entry for `appium-xcuitest-driver` so that all
        driver instances running in the same environment can discover it.

2. **Start multiple Appium servers**, for example:

    ```bash
    # Server 1
    appium --port 4723

    # Server 2
    appium --port 4725
    ```

3. **Assign devices to servers** via capabilities:

    - Server 1 handles device A (iOS 18.x, UDID `<iphone-udid>`)
    - Server 2 handles device B (tvOS 18.x, UDID `<appletv-udid>`)

4. **Run tests in parallel** across servers:

    - Each server behaves as described in the single‑server section, using the shared tunnel
        registry.
    - Tunnels are created only once; both servers reuse the same IPv6 tunnel and Remote XPC
        infrastructure for each device.

### Alternative: one tunnel process per isolation boundary

In more advanced setups (e.g., Docker, multiple hosts, CI agents), you might:

- Run **one tunnel‑creation process per container/VM**, started together with that container’s
    Appium server(s).
- Use distinct `--tunnel-registry-port` values for each isolation boundary.

This keeps tunnel state scoped to each environment, but within that boundary you should still
avoid running multiple competing tunnel‑creation scripts simultaneously, as they may fight over
TUN/TAP configuration and USBMUX connections.

### Guidelines for multi‑server parallelism

- **Prefer a single global tunnel process per physical host** and share it between servers.
- Ensure all Appium servers that should share tunnels:
    - Run under the same user or environment where the strongbox entry is accessible, or
    - Are configured to discover the same tunnel registry port (by starting the script with an
        explicit `--tunnel-registry-port`).
- As with a single server, never assign the **same UDID to multiple concurrent sessions** unless
    your test coordination knows exactly what it is doing.

## tvOS‑specific notes

- The tunnel creation and Remote XPC mechanism works the same way for **tvOS 18+** as for iOS 18+.
- Use:
    - `"platformName": "tvOS"`
    - A tvOS 18+ `platformVersion`
    - The UDID of the Apple TV device
- Only devices connected via USB are currently supported. Support for wirelessly connected TV
    devices is coming.
