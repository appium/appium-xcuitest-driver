---
title: MJPEG Screenshot Stream
---

The XCUITest driver supports a **MJPEG screenshot stream** provided by WebDriverAgent (WDA). This feature allows real-time device screens to be broadcast as a continuous stream of JPEG frames over HTTP, which can be used for screen recording, live viewing, or using the latest stream frame as the source for screenshot commands.

## Overview

When WDA runs on the device or simulator, it starts an **MJPEG screenshots broadcaster** service on a dedicated TCP port (default **9100**). This service:

- Captures the device screen at a configurable framerate (screenshots per second)
- Encodes each frame as JPEG with configurable quality
- Optionally downscales frames by a configurable factor
- Streams frames to all connected clients using the **multipart/x-mixed-replace** HTTP response format (standard MJPEG over HTTP)

Any client that connects to the stream URL and sends a request receives a never-ending HTTP response where the body is a sequence of JPEG images (each with a boundary and headers). This is the same format used by many IP cameras and browser-based MJPEG viewers.

## Use Cases

| Use case | Description |
|----------|-------------|
| **Screen recording** | The driver’s [`mobile: startRecordingScreen`](../reference/commands.md#startrecordingscreen) can use the MJPEG stream as input to **ffmpeg** to produce MP4 (or other) video files. This is the default when using the `mjpeg` video type. |
| **Screenshots from stream** | If you set the **`mjpegScreenshotUrl`** capability, the driver uses the **latest frame** from that MJPEG stream when you call the screenshot command instead of calling WDA’s regular screenshot API. |
| **Live viewing / custom tools** | Any HTTP client (browser, script, or custom app) can connect to the MJPEG URL (after port forwarding for real devices) to view or process the live screen. |

## Capabilities

| <div style="width:14em">Capability</div> | Description |
|------------|-------------|
| **`appium:mjpegServerPort`** | Port on which WDA broadcasts the MJPEG stream. Default: **9100**. Change this if the default port is already in use (e.g. when running [parallel sessions](parallel-tests.md)); each session must use a unique MJPEG port if you use MJPEG features. |
| **`appium:mjpegScreenshotUrl`** | URL of a service that provides real-time device screenshots in MJPEG format. If set, the driver uses this stream for the **screenshot** command (returning the latest frame as the screenshot). Appium does **not** set up port forwarding for this URL; you must ensure the URL is reachable (e.g. by using the same port forwarding that `mjpegServerPort` uses, or an external MJPEG server). Example: `http://<host>:9100`. |

For full capability details, see [Capabilities](../reference/capabilities.md).

## Settings

You can tune how WDA produces the MJPEG stream via the [Settings API](../reference/settings.md). These settings affect framerate, scaling, and JPEG quality of the broadcast only.

| <div style="width:15em">Setting</div> | Type | Description | Default |
|------------------------------|------|-------------|---------|
| **`mjpegServerFramerate`** | `int` | Maximum screenshots per second sent by the MJPEG broadcaster. Allowed range: **1–60**. | `10` |
| **`mjpegScalingFactor`** | `float` | Percentage used to downscale MJPEG frames. **1–100**; `100` means no downscaling. | `100` |
| **`mjpegServerScreenshotQuality`** | `int` | JPEG compression quality for MJPEG frames (1–100). Lower values mean smaller **file size on the wire** (more compression) and lower visual quality; higher values mean larger frames (less compression) and better visual quality. | `25` |

Example (via Settings API):

```json
{
  "settings": {
    "mjpegServerFramerate": 15,
    "mjpegScalingFactor": 50,
    "mjpegServerScreenshotQuality": 50
  }
}
```

## How it works (driver and WDA)

### Port forwarding

- For **real devices**, the driver forwards the **device** MJPEG port to the **host** so that clients can connect to e.g. `http://localhost:9100` (or the port you set with `mjpegServerPort`). If the default port is in use and you did not set `mjpegServerPort`, the driver logs a warning and MJPEG-based features (like MJPEG-based screen recording) may be unavailable for that session.
- For **simulators**, the MJPEG server is already on the host, so no port forwarding is needed for local access.

### WDA implementation (WebDriverAgentLib)

At a high level, [WebDriverAgent](https://github.com/appium/WebDriverAgent) exposes an HTTP MJPEG endpoint that continuously captures the screen, encodes each frame as JPEG, and streams frames to all connected clients using the `multipart/x-mixed-replace` response format. The capture rate, scaling, quality, and orientation of these frames are controlled by the MJPEG-related [settings](../reference/settings.md) and a few [environment variables](../reference/env-vars.md) that WebDriverAgent reads when the screenshots broadcaster is initialized.

### Screenshot command and `mjpegScreenshotUrl`

If **`appium:mjpegScreenshotUrl`** is set at session start, the driver starts an internal **MJPEG stream client** that connects to that URL. When you call the **screenshot** command, the driver returns the **latest received frame** from this stream (as PNG base64) instead of calling WDA’s normal screenshot endpoint. If no frame has been received yet, it falls back to the regular screenshot path.

### Screen recording

For **`startRecordingScreen`** command with video type **`mjpeg`** (the default), the driver uses **ffmpeg** with input `-f mjpeg -i <url>`, where the URL is the MJPEG stream (typically the forwarded `mjpegServerPort`). Frames from the stream are then encoded (e.g. to H.264) and written to an MP4 file. The recording quality and framerate can be aligned with the MJPEG settings (e.g. `mjpegServerFramerate`, `mjpegServerScreenshotQuality`) and with the `videoFps` / `videoQuality` options of the recording API.

## Parallel sessions

When running [parallel tests](parallel-tests.md), each session that uses MJPEG (e.g. screen recording or `mjpegScreenshotUrl`) must use a **different** `mjpegServerPort`. Otherwise port conflicts or wrong-stream issues can occur. The driver will try to forward the requested MJPEG port; if the default 9100 is already in use and you did not set a custom port, it only warns and leaves MJPEG features unavailable for that session.

## Requirements

- **Screen recording** via MJPEG: **ffmpeg** must be installed and on the PATH (e.g. `brew install ffmpeg`). The driver uses the MJPEG stream as ffmpeg input.
- **`mjpegScreenshotUrl`**: The given URL must be reachable from the Appium process (e.g. correct host/port and, for real devices, port forwarding if the stream is on the device).

## Summary

| Topic | Details |
|-------|---------|
| **Default port** | 9100 (`mjpegServerPort`) |
| **Protocol** | HTTP, `multipart/x-mixed-replace` (MJPEG) |
| **Default framerate** | 10 fps (`mjpegServerFramerate`) |
| **Default quality** | 25% JPEG (`mjpegServerScreenshotQuality`) |
| **Default scaling** | 100% (`mjpegScalingFactor`) |
| **Related commands** | Screenshot (when `mjpegScreenshotUrl` is set), `startRecordingScreen` command (with MJPEG input) |
| **Related reference** | [Capabilities](../reference/capabilities.md), [Settings](../reference/settings.md), [Execute methods](../reference/execute-methods.md) |
