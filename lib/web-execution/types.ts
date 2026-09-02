import type {ActionSequence, Cookie, Element, Rect} from '@appium/types';

/**
 * A WebDriver-shaped backend for the commands that run against a web view: element
 * find/interact, navigation, frames/windows, cookies, script execution, screenshots,
 * W3C Actions, and JS-dialog handling.
 *
 * There are two implementations - {@linkcode AtomsBackend}, wrapping the driver's existing
 * Selenium-atoms machinery, and {@linkcode AutomationSessionBackend}, wrapping an
 * `appium-remote-debugger` `AutomationSession` - selected by `XCUITestDriver#_webExecutionBackend`
 * depending on whether an automation session is currently active. Command handlers call through
 * this interface without knowing (or caring) which one is live.
 *
 * Elements cross this boundary as plain element IDs (already unwrapped by the caller) or, for
 * results, as full W3C-shaped {@linkcode Element} objects - each implementation handles its own
 * wrapping/unwrapping/caching internally.
 */
export interface WebExecutionBackend {
  // Elements
  findElement(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element>;
  findElements(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element[]>;
  click(elementId: string): Promise<void>;
  clear(elementId: string): Promise<void>;
  sendKeys(elementId: string, value: string | string[] | number): Promise<void>;
  submit(elementId: string): Promise<void>;
  getText(elementId: string): Promise<string>;
  getTagName(elementId: string): Promise<string>;
  getAttribute(elementId: string, name: string): Promise<string | null>;
  getProperty(elementId: string, name: string): Promise<string | null>;
  getCssValue(elementId: string, propertyName: string): Promise<string>;
  isDisplayed(elementId: string): Promise<boolean>;
  isEnabled(elementId: string): Promise<boolean>;
  isSelected(elementId: string): Promise<boolean>;
  getRect(elementId: string): Promise<Rect>;
  elementScreenshot(elementId: string): Promise<string>;

  // Navigation
  navigate(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  refresh(): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getTitle(): Promise<string>;
  getPageSource(): Promise<string>;

  // Frames / windows
  switchToFrame(target: number | Element | string): Promise<void>;
  switchToParentFrame(): Promise<void>;
  switchToDefaultContent(): Promise<void>;
  getActiveElement(): Promise<Element | null>;
  getWindowHandle(): Promise<string>;
  getWindowHandles(): Promise<string[]>;
  /**
   * Switches the driven window/tab to the one identified by `handle` - a value previously
   * returned by {@linkcode getWindowHandle}/{@linkcode getWindowHandles} from the *same* backend.
   * Handles are not portable across backends: atoms addresses windows by XCUITest webview
   * context id, while an automation session addresses them by WebKit's own opaque browsing-context
   * handle.
   */
  switchToWindow(handle: string, skipReadyCheck?: boolean): Promise<void>;
  getWindowRect(): Promise<Rect>;
  setWindowRect(x?: number, y?: number, width?: number, height?: number): Promise<void>;
  maximizeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  fullscreenWindow(): Promise<void>;
  closeWindow(): Promise<void>;

  // Cookies
  getCookies(): Promise<Cookie[]>;
  addCookie(cookie: Cookie): Promise<void>;
  deleteCookie(name: string): Promise<void>;
  deleteAllCookies(): Promise<void>;

  // Script execution
  executeScript<T = unknown>(script: string, args?: unknown[]): Promise<T>;
  executeAsyncScript<T = unknown>(script: string, args?: unknown[]): Promise<T>;

  // Screenshots
  screenshot(coordinateSystem?: 'Viewport' | 'Page'): Promise<string>;

  // W3C Actions
  performActions(actions: ActionSequence[]): Promise<void>;
  releaseActions(): Promise<void>;

  // JS dialogs
  isShowingJavaScriptDialog(): Promise<boolean>;
  getDialogMessage(): Promise<string>;
  acceptDialog(): Promise<void>;
  dismissDialog(): Promise<void>;
  setDialogUserInput(userInput: string): Promise<void>;
  getAlertButtons(): Promise<string[]>;
}
