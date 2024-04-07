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
