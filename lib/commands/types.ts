import {Element, HTTPHeaders} from '@appium/types';
import type B from 'bluebird';
import type {EventEmitter} from 'node:events';
import {SetOptional} from 'type-fest';
import {Page} from '../types';

export type Direction = 'up' | 'down' | 'left' | 'right';

export enum AppState {
  /**
   * The application’s current state is not known.
   */
  XCUIApplicationStateUnknown = 0,
  /**
   * The application is not running
   */
  XCUIApplicationStateNotRunning = 1,
  /**
   * The application is running in the background, but is suspended.
   */
  XCUIApplicationStateRunningBackgroundSuspended = 2,
  /**
   * The application is running in the background.
   */
  XCUIApplicationStateRunningBackground = 3,
  /**
   * The application is running in the foreground.
   */
  XCUIApplicationStateRunningForeground = 4,
}

/**
 * Battery state
 * @see {@linkcode BatteryInfo}
 */
export enum BatteryState {
  UIDeviceBatteryStateUnknown = 0,
  UIDeviceBatteryStateUnplugged = 1, // on battery, discharging
  UIDeviceBatteryStateCharging = 2, // plugged in, less than 100%
  UIDeviceBatteryStateFull = 3, // plugged in, at 100%
}

/**
 * Battery information. Returned by `mobileGetBatteryInfo` command
 */
export interface BatteryInfo {
  /**
   * Battery level in range `[0.0, 1.0]`, where `1.0` means 100% charge.
   */
  level: number;
  /**
   * Battery state
   */
  state: BatteryState;
}

/**
 * Options for `stopRecordingScreen` command
 */
export interface StopRecordingScreenOptions {
  /**
   * The path to the remote location, where the resulting video should be
   * uploaded.
   *
   * The following protocols are supported: `http`, `https`, `ftp`. Null or empty
   * string value (the default setting) means the content of resulting file
   * should be encoded as Base64 and passed as the endpoint response value. An
   * exception will be thrown if the generated media file is too big to fit into
   * the available process memory.
   */
  remotePath?: string;
  /**
   * The name of the user for the remote authentication.
   *
   * Only works if `remotePath` is provided.
   */
  user?: string;
  /**
   * The password for the remote authentication.
   *
   * Only works if `remotePath` is provided.
   */
  pass?: string;
  /**
   * Additional headers mapping for multipart http(s) uploads
   */
  headers?: HTTPHeaders;
  /**
   * The name of the form field where the file content BLOB should be stored for
   * http(s) uploads
   */
  fileFieldName?: string;
  /**
   * Additional form fields for multipart http(s) uploads
   */
  formFields?: Record<string, any> | [string, any][];
  /**
   * The http multipart upload method name.
   *
   * Only works if `remotePath` is provided.
   *
   * @defaultValue 'PUT'
   */
  method?: 'PUT' | 'POST' | 'PATCH';
}

export type VideoQuality = 'low' | 'medium' | 'high' | 'photo';

/**
 * Options for `startRecordingScreen` command
 */
export interface StartRecordingScreenOptions extends StopRecordingScreenOptions {
  /**
   * The video codec type used for encoding of the be recorded screen capture.
   *
   * Execute `ffmpeg -codecs` in the terminal to see the list of supported video codecs.
   * @defaultValue 'mjpeg'
   */
  videoType?: string;
  /**
   * The video encoding quality
   * @defaultValue 'medium'
   */
  videoQuality?: VideoQuality | number;
  /**
   * The Frames Per Second rate of the recorded video.
   *
   * Change this value if the resulting video is too slow or too fast.
   * @defaultValue 10
   */
  videoFps?: string | number;
  /**
   * The FFMPEG video filters to apply.
   *
   * These filters allow to scale, flip, rotate and do many other useful transformations on the source video stream.  See [FFMPEG documentation](https://ffmpeg.org/ffmpeg-filters.html) for formatting help.
   * @see https://ffmpeg.org/ffmpeg-filters.html
   */
  videoFilters?: string;
  /**
   * The scaling value to apply.
   *
   * See [the FFMPEG wiki](https://trac.ffmpeg.org/wiki/Scaling) for possible values.
   *
   * No scale is applied by default. If both `videoFilters` and `videoScale` are set then only `videoFilters` value will be respected.
   * @see https://trac.ffmpeg.org/wiki/Scaling
   */
  videoScale?: string;
  /**
   * Output pixel format.
   *
   * Execute `ffmpeg -pix_fmts` to list possible values. For Quicktime
   * compatibility, set to `yuv420p` along with videoType: `libx264`.
   */
  pixelFormat?: string;
  /**
   * If `true`, ignore errors and restart immediately.  If `false` or not provided, try to catch and upload/return the currently running screen recording.
   * @defaultValue false
   */
  forceRestart?: boolean;
  /**
   * The maximum recording time, in seconds.
   * The the maximum value is 600 (10 minutes).
   * @defaultValue 180
   */
  timeLimit?: string | number;
}

export interface PageChangeNotification {
  pageArray: Page[];
  appIdKey: string;
}

/**
 * Either a string that contains full path to the mount root for real devices, or a function which accepts two parameters
 * (bundle identifier and optional container type) and returns (or resolves) the full path to the container root folder on the local filesystem.
 */
export type ContainerRootSupplier = (
  bundleId: string,
  containerType: string | null
) => string | Promise<string>;

export interface WaitingAtoms {
  count: number;
  alertNotifier: EventEmitter;
  alertMonitor: B<void>;
}

export interface ContainerObject {
  /**
   * The parsed bundle identifier
   */
  bundleId: string;
  /**
   * The absolute full path of the item on the local filesystem
   */
  pathInContainer: string;
  /**
   * The container type
   */
  containerType: string | null;
}

export type AtomsElement<S extends string = string> = Omit<
  Element<S>,
  'element-6066-11e4-a52e-4f735466cecf'
>;

export interface Context {
  /**
   * The identifier of the context.
   *
   * The native context will be `NATIVE_APP` and the webviews will be `WEBVIEW_xxx`
   */
  id: string;
  /**
   * The title associated witht he webview content
   */
  title?: string;
  /**
   * The URL associated with the webview content
   */
  url?: string;
}

export type ViewContext<S extends string = string> = Context &
  (S extends NativeAppId ? {view: SetOptional<View, 'id'>} : {view: View});

export type NativeAppId = 'NATIVE_APP';

export type FullContext<S extends string = string> = Omit<View, 'id'> & ViewContext<S>;

export interface View {
  /**
   * @privateRemarks Type of this is best guess
   */
  id: number | string;
  title?: string;
  url?: string;
  bundleId?: string;
}
