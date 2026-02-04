export interface Page {
  id: number | string;
  isKey?: boolean;
  url: string;
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
