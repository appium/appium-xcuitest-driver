---
title: Apple TV Pairing
---

This guide explains how to pair Apple TV / tvOS devices over WiFi so that they can be used
with Remote XPC–based tunnels in the XCUITest driver.

The actual pairing protocol, discovery, and strongbox-backed credential storage are
implemented in the `appium-ios-remotexpc` library. The XCUITest driver provides a small
wrapper script around that functionality.

## Prerequisites

- An Apple TV device that you want to automate
- The XCUITest driver and its optional dependency `appium-ios-remotexpc` installed
- Your Apple TV and the host machine on the **same network segment**
- Apple TV in pairing / discovery mode (see external guide below)

## Pairing via the XCUITest driver

Use the driver-level script to run the pairing flow:

```bash
appium driver run xcuitest pair-appletv --
```

This will:

- Discover Apple TV devices on the local network
- Prompt you to select a device (or respect `--device` if provided)
- Run the HAP-based pairing flow, including PIN entry
- Store credentials via Appium Strongbox

When pairing succeeds, the script prints the Apple TV **device identifier**. Use this
identifier later as the `appium:udid` when WiFi tvOS tunnels are enabled.

### Targeting a specific Apple TV

You can skip interactive selection by using the `--device` option:

```bash
appium driver run xcuitest pair-appletv -- --device "Living Room"
appium driver run xcuitest pair-appletv -- --device 0
appium driver run xcuitest pair-appletv -- --device AA:BB:CC:DD:EE:FF
```

## Detailed pairing behavior (external docs)

For a deep dive into how Apple TV pairing works (discovery, PIN entry, cryptography,
and where credentials are stored), refer to the upstream `appium-ios-remotexpc`
documentation:

- [Apple TV Pairing Instructions](https://github.com/appium/appium-ios-remotexpc/blob/main/docs/apple-tv-pairing-guide.md)

That document covers:

- Network and discovery requirements
- How to put Apple TV into discovery mode
- PIN verification and error handling
- Strongbox-backed credential storage details

