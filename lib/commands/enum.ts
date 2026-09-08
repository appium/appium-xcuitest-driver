/**
 * Mapping of permission resource name to identifier.
 * @see https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc
 */

export enum PermissionService {
  contacts = 1,
  calendar = 2,
  reminders = 3,
  photos = 4,
  microphone = 5,
  camera = 6,
  medialibrary = 7,
  homekit = 8,
  focus = 9,
  // macOS specific
  systemroot = 0x40000000,
  userdesktop = 0x40000001,
  userdownloads = 0x40000002,
  userdocuments = 0x40000003,
  networkvolumes = 0x40000004,
  removablevolumes = 0x40000005,
  appleevents = 0x40000006,
  // iOS Family-specific
  bluetooth = -0x40000000,
  keyboardnet = -0x40000001,
  location = -0x40000002,
  health = -0x40000003,
  usertracking = -0x40000004,
  localnetwork = -0x40000005,
}

/**
 * @see https://developer.apple.com/documentation/corelocation/clauthorizationstatus
 */
export enum AuthorizationStatus {
  notDetermined = 0,
  restricted = 1,
  denied = 2,
  authorizedAlways = 3,
  authorizedWhenInUse = 4,
}

/**
 * Thermal state of an iOS device.
 *
 * Returned (since iOS 11.0) within a {@linkcode DeviceInfo} response.
 * @see https://developer.apple.com/documentation/foundation/nsprocessinfothermalstate
 */
export enum ThermalState {
  /**
   * The thermal state is within normal limits.
   */
  NSProcessInfoThermalStateNominal = 0,
  /**
   * The thermal state is slightly elevated.
   */
  NSProcessInfoThermalStateFair = 1,
  /**
   * The thermal state is high.
   */
  NSProcessInfoThermalStateSerious = 2,
  /**
   * The thermal state is significantly impacting the performance of the system and the device needs to cool down.
   */
  NSProcessInfoThermalStateCritical = 3,
}
/**
 * Application state code.
 * @see https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
 */
export enum AppState {
  /**
   * The application's current state is not known.
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
  /**
   * The battery state is unknown.
   */
  UIDeviceBatteryStateUnknown = 0,
  /**
   * The device is running on battery and discharging.
   */
  UIDeviceBatteryStateUnplugged = 1,
  /**
   * The device is plugged in, less than 100%, and charging.
   */
  UIDeviceBatteryStateCharging = 2,
  /**
   * The device is plugged in and is at 100% charge.
   */
  UIDeviceBatteryStateFull = 3,
}
