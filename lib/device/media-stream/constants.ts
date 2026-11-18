export const MEDIA_STREAM_MODULE = 'appium:mediaStream';
export const MEDIA_UNITS_EVENT = `${MEDIA_STREAM_MODULE}.units`;
export const MEDIA_STARTED_EVENT = `${MEDIA_STREAM_MODULE}.started`;
export const MEDIA_FORMAT_CHANGED_EVENT = `${MEDIA_STREAM_MODULE}.formatChanged`;
export const MEDIA_ENDED_EVENT = `${MEDIA_STREAM_MODULE}.ended`;
export const BACKPRESSURE_EVENT_NAME = 'bidiBackpressure';
export const KEYFRAME_REQUEST_MIN_INTERVAL_MS = 1000;
// The encoder reports its first unit right after it starts, regardless of screen activity
export const FIRST_UNIT_TIMEOUT_MS = 5000;
export const DEFAULT_BATCH_MS = 40;
export const DEFAULT_IDLE_HEARTBEAT_MS = 1000;
export const MIN_SIMULATOR_XCODE_MAJOR = 26;
// Upper bounds for client-supplied options, so one request cannot overload the server
export const MAX_FPS = 120;
export const MAX_BITRATE = 100_000_000;
export const MAX_BATCH_MS = 1000;
export const MIN_IDLE_HEARTBEAT_MS = 100;
export const MAX_IDLE_HEARTBEAT_MS = 60_000;
export const MAX_DISPLAY_ID = 0xffffffff;
// Bounds the wait on the device/simulator, so a hung source cannot block the session teardown
export const SOURCE_START_TIMEOUT_MS = 60_000;
export const SOURCE_STOP_TIMEOUT_MS = 15_000;
