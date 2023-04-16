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
 */
export type CustomOpts = {
  device: any;
  realDevice: any;
  SimulatorWindowCenter: any;
  forceSimulatorSoftwareKeyboardPresence: any;
  iosSdkVersion: string;
  platformVersion: string;
  safari: any;
  sessionId: string | null;
  elementResponseAttributes: any;
};

