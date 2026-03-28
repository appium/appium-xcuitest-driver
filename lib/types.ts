export interface Page {
  id: number | string;
  isKey?: boolean;
  url: string;
}

/**
 * Condition inducer profile configuration
 */
export interface Profile {
  name: string;
  /** The property is profileID used in {@linkcode XCUITestDriver.enableConditionInducer} */
  identifier: string;
  /** Configuration details */
  description: string;
}

/**
 * We can use the returned data to determine whether the Condition is enabled and the currently enabled configuration information
 */
export interface Condition {
  profiles: Profile[];
  /** The property is conditionID used in {@linkcode XCUITestDriver.enableConditionInducer} */
  identifier: string;
  profilesSorted: boolean;
  isDestructive: boolean;
  isInternal: boolean;
  /** `true` if this condition identifier is enabled */
  isActive: boolean;
  /** Enabled profiles identifier */
  activeProfile: string;
}

/**
 * Facade for condition-inducer operations (RemoteXPC on iOS 18+ vs legacy instrument service).
 * Constructed by `createConditionInducer` in `device/condition-inducer-client`.
 */
export interface IConditionInducer {
  list(): Promise<Condition[]>;
  enable(conditionID: string, profileID: string): Promise<boolean>;
  disable(): Promise<boolean>;
  close(): Promise<void>;
  isActive(): boolean;
}

export interface AsyncPromise {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export interface LifecycleData {
  createSim?: boolean;
}

export interface CalibrationData {
  /**
   * webview x offset in real coordinates
   */
  offsetX: number;
  /**
   * webview y offset in real coordinates
   */
  offsetY: number;
  /**
   * pixel ratio x inside of the web view
   */
  pixelRatioX: number;
  /**
   * pixel ratio y inside of the web view
   */
  pixelRatioY: number;
}

/**
 * Application information returned by installation proxy services
 */
export interface AppInfo {
  /** Bundle identifier of the application */
  CFBundleIdentifier?: string;
  /** Name of the application bundle */
  CFBundleName?: string;
  /** Display name of the application */
  CFBundleDisplayName?: string;
  /** Build version of the application */
  CFBundleVersion?: string;
  /** Marketing version (e.g., "1.0.0") */
  CFBundleShortVersionString?: string;
  /** Application type (e.g., "User", "System") */
  ApplicationType?: string;
  /** Path to the application on device */
  Path?: string;
  /** Path to the application's data container */
  Container?: string;
  /** Static disk usage in bytes */
  StaticDiskUsage?: number;
  /** Dynamic disk usage in bytes */
  DynamicDiskUsage?: number;
  /** Additional platform-specific properties */
  [key: string]: unknown;
}

/**
 * Mapping of bundle identifiers to application information
 */
export type AppInfoMapping = Record<string, AppInfo>;
