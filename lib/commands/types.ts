import type {AnyCase, Element, HTTPHeaders, Location, Size, StringRecord} from '@appium/types';
import type B from 'bluebird';
import type {EventEmitter} from 'node:events';
import type {LiteralUnion, SetOptional, SetRequired} from 'type-fest';
import type {Page} from '../types';
import type {AuthorizationStatus, BatteryState, ThermalState} from './enum';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type LocationWithAltitude = SetRequired<Location, 'altitude'>;

/**
 * Battery information. Returned by the `mobile: getBatteryInfo` execute method.
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
  containerType: string | null,
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
   * The title associated with the webview content
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

/**
 *  Page tree source representation formats.
 *
 *  - `xml`: Generates the output similar to what the `getPageSource` standard API returns.
 *  - `description`: This is how XCTest "sees" the page internally and is the same string as the [`debugDescription`](https://developer.apple.com/documentation/xctest/xcuielement/1500909-debugdescription?language=objc) API would return for the root application element.
 *     This source representation format is useful for debugging purposes and is the fastest
 *     one to fetch.
 * - `json`: Similar to `xml`, but the tree hierarchy is represented as JSON elements.
 */
export type SourceFormat = 'xml' | 'json' | 'description';

/** @deprecated */
export type AppInstallStrategy = 'serial' | 'parallel' | 'ios-deploy';

export interface ProfileManifest {
  Description: string;
  IsActive: boolean;
}

export interface ProfileMetadata {
  PayloadDescription: string;
  PayloadDisplayName: string;
  PayloadOrganization: string;
  PayloadRemovalDisallowed: boolean;
  PayloadUUID: string;
  PayloadVersion: number;
}

export interface CertificateList {
  OrderedIdentifiers: string[];
  ProfileManifest: Record<string, ProfileManifest>;
  ProfileMetadata: Record<string, ProfileMetadata>;
  Status: 'Acknowledged';
}

/**
 * Returned by `mobile: deviceInfo` command.
 */
export interface DeviceInfo {
  currentLocale: string;
  timeZone: string;
  name: string;
  model: string;
  uuid: LiteralUnion<'unknown', string>;
  userInterfaceIdiom: string;
  userInterfaceStyle: string;
  isSimulator: boolean;
  thermalState?: ThermalState;
}

/**
 * Returned within response from `mobile: deviceInfo` command on real devices.
 * @group Real Device Only
 * @author Ionic Team <hi@ionicframework.com> (https://ionicframework.com)
 * @privateRemarks Copied from https://github.com/ionic-team/native-run/blob/2e431d373a3adc75ab402b2bf6a2235360efa0d2/src/ios/lib/client/lockdownd.ts#L12-L41
 */

export interface LockdownInfo {
  BasebandCertId: number;
  BasebandKeyHashInformation: {
    AKeyStatus: number;
    SKeyHash: Buffer;
    SKeyStatus: number;
  };
  BasebandSerialNumber: Buffer;
  BasebandVersion: string;
  BoardId: number;
  BuildVersion: string;
  ChipID: number;
  DeviceClass: string;
  DeviceColor: string;
  DeviceName: string;
  DieID: number;
  HardwareModel: string;
  HasSiDP: boolean;
  PartitionType: string;
  ProductName: string;
  ProductType: string;
  ProductVersion: string;
  ProductionSOC: boolean;
  ProtocolVersion: string;
  TelephonyCapability: boolean;
  UniqueChipID: number;
  UniqueDeviceID: string;
  WiFiAddress: string;
  [key: string]: any;
}

/**
 * Response of the `mobile: activeAppInfo` command.
 * @remarks Derived from https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBCustomCommands.m
 */
export interface ActiveAppInfo {
  pid: number;
  bundleId: string;
  name: string;
  processArguments: ProcessArguments;
}

/**
 * Returned within an {@linkcode ActiveAppInfo} object.
 * @remarks Derived from https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBCustomCommands.m
 */
export interface ProcessArguments {
  env: StringRecord<string>;
  args: string[];
}

/**
 * Pressable button names; used by the {@linkcode XCUITest.mobilePressButton mobile: pressButton} command.
 */
export type ButtonName = AnyCase<
  | 'home'
  | 'volumeup'
  | 'volumedown'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'menu'
  | 'playpause'
  | 'select'
>;

/**
 * Returned in the {@linkcode XCUITest.mobileGetAppearance mobile: getAppearance} command response.
 */
export type Style = 'dark' | 'light' | 'unsupported' | 'unknown';

export interface ScreenInfo {
  /**
   * Status bar dimensions
   *
   * @see https://developer.apple.com/documentation/xctest/xcuielementtypequeryprovider/1500428-statusbars
   */
  statusBarSize: Size;
  /**
   * Scale of the screen
   *
   * @see https://developer.apple.com/documentation/uikit/uiscreen/1617836-scale
   */
  scale: number;
}

export interface WDALocationInfo extends LocationWithAltitude {
  authorizationStatus: AuthorizationStatus;
}

/**
 * Payload for {@linkcode XCUITestDriver.mobilePushNotification}.
 *
 * Check the output of `xcrun simctl help push` command for more details.
 */
export interface PushPayload {
  /**
   * The `aps` dictionary.
   *
   * Read the [Setting up a Remote Notification Server documentation](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification#2943359) under "Create a JSON Payload" for more details.
   *
   * @privateRemarks The keys of `aps` [are documented](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification#2943360) and we should add them.
   */
  aps: StringRecord;
}

/**
 * Either `plain` to wait for a notification from the default notification center or `darwin` to wait for a system notification.
 */
export type NotificationType = 'plain' | 'darwin';

export type BiometricFeature = 'touchId' | 'faceId';

/**
 * Permission state
 *
 * Details:
 *
 * - `yes`: To grant the permission
 * - `no`: To revoke the permission
 * - `unset`: To reset the permission
 * - `limited`: To grant the permission as limited access (Only for photos)
 */
export type PermissionState = 'yes' | 'no' | 'unset' | 'limited';

/**
 * Access rules for the `mobile: setPermission` execute method.
 *
 * Details:
 *
 * - `all`: Apply the action to all services.
 * - `calendar`: Allow access to calendar.
 * - `contacts-limited`: Allow access to basic contact info.
 * - `contacts`: Allow access to full contact details.
 * - `location`: Allow access to location services when app is in use.
 * - `location-always`: Allow access to location services at all times.
 * - `photos-add`: Allow adding photos to the photo library.
 * - `photos`: Allow full access to the photo library.
 * - `media-library`: Allow access to the media library.
 * - `microphone`: Allow access to audio input.
 * - `motion`: Allow access to motion and fitness data.
 * - `reminders`: Allow access to reminders.
 * - `siri`: Allow use of the app with Siri.
 *
 * @remarks This is similar to--but not exactly the same as--{@linkcode PermissionService}.
 */
export type AccessRule =
  | 'all'
  | 'calendar'
  | 'contacts-limited'
  | 'contacts'
  | 'location'
  | 'location-always'
  | 'photos-add'
  | 'photos'
  | 'media-library'
  | 'microphone'
  | 'motion'
  | 'reminders'
  | 'siri';

/**
 * On-screen keyboard properties.
 *
 * To see possible combinations, execute `xcrun simctl spawn booted defaults read .GlobalPreferences.plist AppleKeyboards`
 */
export interface KeyboardOptions {
  /**
   * The name of the keyboard locale, for example `en_US` or `de_CH`
   */
  name: string;
  /**
   * The keyboard layout, for example `QUERTY` or `Ukrainian`
   */
  layout: string;
  hardware?: 'Automatic';
}

/**
 * System language properties
 *
 * To see possible combinations, execute `xcrun simctl spawn booted defaults read .GlobalPreferences.plist AppleLanguages`.
 */
export interface LanguageOptions {
  /**
   * The name of the language, for example `de` or `zh-Hant-CN`
   */
  name: string;
}

/**
 * System locale properties.
 *
 * To see possible combinations, execute `xcrun simctl spawn booted defaults read .GlobalPreferences.plist AppleLocale`.
 */
export interface LocaleOptions {
  /**
   * The name of the system locale, for example `de_CH` or `zh_CN`
   */
  name: string;
  /**
   * Optional calendar format, for example `gregorian` or `persian`
   */
  calendar?: string;
}

/**
 * The result of an XCTest run.
 */
export interface XCTestResult {
  /**
   * Name of the test (e.g.: `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample`)
   */
  testName: string;
  /**
   * Did the test pass?
   */
  passed: boolean;
  /**
   * Did the test crash?
   */
  crashed: boolean;
  /**
   * Test result status (e.g.: 'passed', 'failed', 'crashed')
   * @privateRemarks This should be a union of string literals. Fix it
   */
  status: string;
  /**
   * How long the test took to run (in seconds)
   */
  duration: number;
  /**
   * The failure message (if applicable)
   */
  failureMessage?: string;
  /**
   * The geolocation of the test (if applicable)
   * @privateRemarks Document the type
   */
  location?: string;
}

export interface RunXCTestResult {
  /**
   * The results of each test run
   */
  results: XCTestResult[];
  /**
   * Exit code of the process. `0` means success
   */
  code: number;
  /**
   * The signal that terminated the process (or null) (e.g.: `SIGTERM`)
   * @privateRemarks This should be a union of string literals. Fix it
   */
  signal: string | null;
  /**
   * If all tests passed
   */
  passed: boolean;
}

/**
 * Representation of a viewport.
 *
 * @see https://developer.apple.com/library/archive/documentation/2DDrawing/Conceptual/DrawingPrintingiOS/GraphicsDrawingOverview/GraphicsDrawingOverview.html
 */
export interface Viewport {
  /**
   * Distance from left of screen
   */
  left: 0;
  /**
   * Distance from top of screen
   */
  top: number;
  /**
   * Screen width
   */
  width: number;
  /**
   * Screen height
   */
  height: number;
}

export interface KeyboardKey {
  /**
   * Represents a key to type (see
   * https://developer.apple.com/documentation/xctest/xcuielement/1500604-typekey?language=objc
   * and https://developer.apple.com/documentation/xctest/xcuikeyboardkey?language=objc)
   */
  key: string;
  /**
   * Set of modifier flags
   * (https://developer.apple.com/documentation/xctest/xcuikeymodifierflags?language=objc)
   * to use when typing the key.
   */
  modifierFlags?: number;
}

export interface LogEntry {
  timestamp: number;
  level: string,
  message: string;
}
