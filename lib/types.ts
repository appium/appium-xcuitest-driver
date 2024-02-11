import {StringRecord} from '@appium/types';

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

/**
 * All of these options are manually added to the `opts` property of the driver, which is strongly discouraged.
 *
 * Future versions of this driver should move these properties somewhere else.
 *
 * @todo If anyone knows anything about the types of these values, please fill them in.
 */
export interface CustomOpts {
  device: any;
  realDevice: any;
  SimulatorWindowCenter: any;
  forceSimulatorSoftwareKeyboardPresence: any;
  iosSdkVersion: string;
  platformVersion: string;
  safari: any;
  sessionId: string | null;
  elementResponseAttributes: any;
}

export interface WDASettings {
  elementResponseAttributes: string;
  shouldUseCompactResponses: boolean;
  mjpegServerScreenshotQuality?: number;
  mjpegServerFramerate?: number;
  screenshotQuality?: number;
}

/**
 * @todo This should likely be shipped by `appium-webdriveragent` instead.
 */
export interface WDACapabilities {
  bundleId?: string;
  initialUrl?: string;
  arguments: string[];
  environment: Record<string, string>;
  eventloopIdleDelaySec: number;
  shouldWaitForQuiescence: boolean;
  shouldUseTestManagerForVisibilityDetection: boolean;
  maxTypingFrequency: number;
  shouldUseSingletonTestManager: boolean;
  waitForIdleTimeout?: number;
  shouldUseCompactResponses?: number;
  elementResponseFields?: unknown;
  disableAutomaticScreenshots?: boolean;
  shouldTerminateApp: boolean;
  forceAppLaunch: boolean;
  useNativeCachingStrategy: boolean;
  forceSimulatorSoftwareKeyboardPresence: boolean;
  defaultAlertAction: 'accept' | 'dismiss';
  capabilities?: StringRecord<any>;
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
