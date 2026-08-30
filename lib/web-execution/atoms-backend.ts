import type {ActionSequence, Cookie, Element, Position, Rect, Size} from '@appium/types';
import type {AtomName} from 'appium-remote-debugger';
import {errors} from 'appium/driver.js';
import {waitForCondition} from 'asyncbox';

import {NATIVE_WIN} from '../commands/constants.js';
import {prepareInputValue} from '../commands/element.js';
import {checkForAlert, createJSCookie, hasElementId} from '../commands/web.js';
import type {XCUITestDriver} from '../driver.js';
import {isEmpty, toErrorMessage} from '../utils/index.js';
import type {WebExecutionBackend} from './types.js';

const CLOSE_WINDOW_TIMEOUT_MS = 5000;
const CLOSE_WINDOW_INTERVAL_MS = 100;

// WebKit's wording for a cross-origin frame access failure.
const CROSS_ORIGIN_FRAME_ERROR_PATTERN = /cross-origin frame|blocked a frame with origin/i;

/**
 * Routes web-execution commands through the driver's existing Selenium-atoms machinery
 * (`executeAtom`, `getAtomsElement`, `convertElementsForAtoms`, `cacheWebElements`, the remote
 * debugger's own `Page`/`Runtime`-domain calls, etc.). This is today's atoms-based behavior,
 * made explicit and swappable - none of the underlying atoms logic itself moves or changes.
 *
 * A handful of interface methods have no atoms equivalent at all (window sizing, parent frame
 * navigation, real W3C Actions) - those throw {@linkcode errors.NotImplementedError}, same as
 * if the command didn't exist prior to this backend/interface split.
 */
export class AtomsBackend implements WebExecutionBackend {
  private readonly driver: XCUITestDriver;

  constructor(driver: XCUITestDriver) {
    this.driver = driver;
  }

  async findElement(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element> {
    return await this.driver.findWebElementOrElements(strategy, selector, false, ctx);
  }

  async findElements(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element[]> {
    return await this.driver.findWebElementOrElements(strategy, selector, true, ctx);
  }

  async click(elementId: string): Promise<void> {
    const {nativeWebTap, nativeWebTapStrict} = this.driver.settings.getSettings();
    if (nativeWebTap || nativeWebTapStrict) {
      // atoms-based clicks don't always work in safari 7
      this.driver.log.debug('Using native web tap');
      await this.driver.nativeWebTap(elementId);
      return;
    }
    const atomsElement = this.driver.getAtomsElement(elementId);
    // clicking can cause an alert to pop up and freeze the event loop, meaning the click atom
    // itself never returns. we have alert handling in `waitForAtom` but with click, we create
    // a special case where if a click results in an unexpected alert error, we just return
    // control to the client. they will encounter the error on their next command, which mirrors
    // the behaviour of selenium.
    try {
      await this.driver.executeAtom('click', [atomsElement]);
    } catch (err: any) {
      if (err.error === errors.UnexpectedAlertOpenError.error()) {
        return;
      }
      throw err;
    }
  }

  async clear(elementId: string): Promise<void> {
    await this.driver.executeAtom('clear', [this.driver.getAtomsElement(elementId)]);
  }

  async sendKeys(elementId: string, value: string | string[] | number): Promise<void> {
    const atomsElement = this.driver.getAtomsElement(elementId);
    if (this.driver.opts.sendKeyStrategy !== 'oneByOne') {
      await this.driver.setValueWithWebAtom(atomsElement, value);
      return;
    }
    for (const char of prepareInputValue(value)) {
      await this.driver.setValueWithWebAtom(atomsElement, char);
    }
  }

  async submit(elementId: string): Promise<void> {
    await this.driver.executeAtom('submit', [this.driver.getAtomsElement(elementId)]);
  }

  async getText(elementId: string): Promise<string> {
    return await this.driver.executeAtom('get_text', [this.driver.getAtomsElement(elementId)]);
  }

  async getTagName(elementId: string): Promise<string> {
    const script = 'return arguments[0].tagName.toLowerCase()';
    return await this.driver.executeAtom('execute_script', [script, [this.driver.getAtomsElement(elementId)]]);
  }

  async getAttribute(elementId: string, name: string): Promise<string | null> {
    return await this.driver.executeAtom('get_attribute_value', [this.driver.getAtomsElement(elementId), name]);
  }

  async getProperty(elementId: string, name: string): Promise<string | null> {
    return await this.driver.executeAtom('get_attribute_value', [this.driver.getAtomsElement(elementId), name]);
  }

  async getCssValue(elementId: string, propertyName: string): Promise<string> {
    return await this.driver.executeAtom('get_value_of_css_property', [
      this.driver.getAtomsElement(elementId),
      propertyName,
    ]);
  }

  async isDisplayed(elementId: string): Promise<boolean> {
    return await this.driver.executeAtom('is_displayed', [this.driver.getAtomsElement(elementId)]);
  }

  async isEnabled(elementId: string): Promise<boolean> {
    return await this.driver.executeAtom('is_enabled', [this.driver.getAtomsElement(elementId)]);
  }

  async isSelected(elementId: string): Promise<boolean> {
    return await this.driver.executeAtom('is_selected', [this.driver.getAtomsElement(elementId)]);
  }

  async getRect(elementId: string): Promise<Rect> {
    const atomsElement = this.driver.getAtomsElement(elementId);
    const {x, y} = (await this.driver.executeAtom('get_top_left_coordinates', [atomsElement])) as Position;
    const {width, height} = (await this.driver.executeAtom('get_size', [atomsElement])) as Size;
    return {x, y, width, height};
  }

  async elementScreenshot(elementId: string): Promise<string> {
    const atomsElement = this.driver.getAtomsElement(elementId);
    const {width, height} = (await this.driver.executeAtom('get_size', [atomsElement])) as Size;
    if (!width || !height) {
      throw new errors.UnableToCaptureScreen('Cannot take a screenshot of a zero-size element');
    }
    const {x, y} = (await this.driver.executeAtom('get_top_left_coordinates', [atomsElement])) as Position;
    return await this.driver.remote.captureScreenshot({rect: {x, y, width, height}});
  }

  async navigate(url: string): Promise<void> {
    await this.driver.remote.navToUrl(url);
  }

  async back(): Promise<void> {
    await this.driver.mobileWebNav('back');
  }

  async forward(): Promise<void> {
    await this.driver.mobileWebNav('forward');
  }

  async refresh(): Promise<void> {
    await this.driver.waitForAtom(this.driver.remote.execute('window.location.reload()'));
  }

  async getCurrentUrl(): Promise<string> {
    return await this.driver.waitForAtom(this.driver.remote.execute<string>('window.location.href'));
  }

  async getTitle(): Promise<string> {
    return await this.driver.waitForAtom(this.driver.remote.execute<string>('window.document.title'));
  }

  async getPageSource(): Promise<string> {
    const script = 'return document.documentElement.outerHTML';
    return await this.driver.executeAtom('execute_script', [script, []]);
  }

  async switchToFrame(target: number | Element | string): Promise<void> {
    try {
      let windowId: string;
      if (hasElementId(target)) {
        const atomsElement = this.driver.getAtomsElement(target);
        const value = (await this.driver.executeAtom('get_frame_window', [atomsElement])) as {WINDOW: string};
        windowId = value.WINDOW;
      } else {
        const atom: AtomName = typeof target === 'number' ? 'frame_by_index' : 'frame_by_id_or_name';
        const value = (await this.driver.executeAtom(atom, [target])) as {WINDOW?: string} | null;
        if (value?.WINDOW === undefined) {
          throw new errors.NoSuchFrameError();
        }
        windowId = value.WINDOW;
      }

      this.driver.log.debug(`Entering new web frame: '${windowId}'`);
      this.driver.curWebFrames.unshift(windowId);
      try {
        await this.driver.executeAtom('execute_script', ['return true;', []]);
      } catch (err) {
        this.driver.curWebFrames.shift();
        throw err;
      }
    } catch (err) {
      if (CROSS_ORIGIN_FRAME_ERROR_PATTERN.test(toErrorMessage(err))) {
        throw new Error(
          'Cannot switch into this frame: it (or one of its ancestor frames) has a different origin than ' +
            "the top-level page. Safari's remote debugger can only execute JavaScript inside same-origin " +
            `frames. Switch to a same-origin frame instead. Original error: ${toErrorMessage(err)}`,
          {cause: err},
        );
      }
      throw err;
    }
  }

  async switchToParentFrame(): Promise<void> {
    throw new errors.NotImplementedError();
  }

  async switchToDefaultContent(): Promise<void> {
    this.driver.curWebFrames = [];
    this.driver.log.debug('Leaving web frame and going back to default content');
  }

  async getActiveElement(): Promise<Element | null> {
    return this.driver.cacheWebElements(await this.driver.executeAtom('active_element', [])) as Element | null;
  }

  async getWindowHandle(): Promise<string> {
    return this.driver.curContext as string;
  }

  async getWindowHandles(): Promise<string[]> {
    const contexts = await this.driver.getContextsAndViews(false);
    return contexts.filter((context) => context.id !== NATIVE_WIN).map((context) => context.view?.id?.toString() ?? '');
  }

  async getWindowRect(): Promise<Rect> {
    const script =
      'return {' +
      'x: window.screenX || 0,' +
      'y: window.screenY || 0,' +
      'width: window.innerWidth,' +
      'height: window.innerHeight' +
      '}';
    return await this.driver.executeAtom('execute_script', [script]);
  }

  async setWindowRect(): Promise<void> {
    throw new errors.NotImplementedError();
  }

  async maximizeWindow(): Promise<void> {
    throw new errors.NotImplementedError();
  }

  async minimizeWindow(): Promise<void> {
    throw new errors.NotImplementedError();
  }

  async fullscreenWindow(): Promise<void> {
    throw new errors.NotImplementedError();
  }

  async closeWindow(): Promise<void> {
    // since the window will be closed and the execution context gone, return
    // first before closing. Waiting for close will happen in the finally block
    const script = `setTimeout(function () {window.open('','_self').close();}, 0); return true;`;
    const context = this.driver.curContext;
    try {
      await this.driver.executeAtom('execute_script', [script, []], true);
    } finally {
      // wait for the window to successfully change...
      try {
        await waitForCondition(() => this.driver.curContext !== context, {
          waitMs: CLOSE_WINDOW_TIMEOUT_MS,
          intervalMs: CLOSE_WINDOW_INTERVAL_MS,
        });
      } catch {
        this.driver.log.debug('Context has not yet been changed after closing window. Continuing...');
      }
    }
  }

  async getCookies(): Promise<Cookie[]> {
    // get the cookies from the remote debugger, or an empty object
    const {cookies} = await this.driver.remote.getCookies();

    // the value is URI encoded, so decode it safely
    return cookies.map((cookie: Cookie) => {
      if (!isEmpty(cookie.value)) {
        try {
          cookie.value = decodeURI(cookie.value);
        } catch (error) {
          this.driver.log.debug(`Cookie ${cookie.name} was not decoded successfully. Cookie value: ${cookie.value}`);
          this.driver.log.warn(error as Error);
          // Keep the original value
        }
      }
      return cookie;
    });
  }

  async addCookie(cookie: Cookie): Promise<void> {
    const jsCookie = createJSCookie(cookie.name, cookie.value, {
      expires: typeof cookie.expiry === 'number' ? new Date(cookie.expiry * 1000).toUTCString() : cookie.expiry,
      path: cookie.path,
      domain: cookie.domain,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
    });
    const script = `document.cookie = ${JSON.stringify(jsCookie)}`;
    await this.driver.executeAtom('execute_script', [script, []]);
  }

  async deleteCookie(name: string): Promise<void> {
    const cookies = await this.getCookies();
    const cookie = cookies.find((c) => c.name === name);
    if (!cookie) {
      this.driver.log.debug(`Cookie '${name}' not found. Ignoring.`);
      return;
    }
    await this.removeCookie(cookie);
  }

  async deleteAllCookies(): Promise<void> {
    const cookies = await this.getCookies();
    await Promise.all(cookies.map((cookie) => this.removeCookie(cookie)));
  }

  async executeScript<T = unknown>(script: string, args: unknown[] = []): Promise<T> {
    const atomsArgs = this.driver.convertElementsForAtoms(args);
    const result = await this.driver.executeAtom('execute_script', [script, atomsArgs]);
    return this.driver.cacheWebElements(result) as T;
  }

  async executeAsyncScript<T = unknown>(script: string, args: unknown[] = []): Promise<T> {
    const convertedArgs = this.driver.convertElementsForAtoms(args);
    this.driver.asyncWaitMs = this.driver.asyncWaitMs || 0;
    const promise = this.driver.remote.executeAtomAsync(
      'execute_async_script',
      [script, convertedArgs, this.driver.asyncWaitMs],
      this.driver.curWebFrames,
    );
    return this.driver.cacheWebElements(await this.driver.waitForAtom(promise)) as T;
  }

  async screenshot(coordinateSystem?: 'Viewport' | 'Page'): Promise<string> {
    return await this.driver.remote.captureScreenshot(coordinateSystem ? {coordinateSystem} : undefined);
  }

  async performActions(_actions: ActionSequence[]): Promise<void> {
    throw new errors.NotImplementedError(
      `W3C actions in a web context require an active automation session ` + `(see 'mobile: startAutomationSession').`,
    );
  }

  async releaseActions(): Promise<void> {
    this.driver.log.info('On this platform, releaseActions is a no-op');
  }

  async isShowingJavaScriptDialog(): Promise<boolean> {
    return await checkForAlert.call(this.driver);
  }

  async getDialogMessage(): Promise<string> {
    const text = await this.driver.proxyCommand<any, string | null>('/alert/text', 'GET');
    if (text === null) {
      throw new errors.NoAlertOpenError();
    }
    return text;
  }

  async acceptDialog(): Promise<void> {
    await this.driver.proxyCommand('/alert/accept', 'POST', {});
  }

  async dismissDialog(): Promise<void> {
    await this.driver.proxyCommand('/alert/dismiss', 'POST', {});
  }

  async setDialogUserInput(userInput: string): Promise<void> {
    await this.driver.proxyCommand('/alert/text', 'POST', {value: userInput});
  }

  async getAlertButtons(): Promise<string[]> {
    return await this.driver.proxyCommand<any, string[]>('/wda/alert/buttons', 'GET');
  }

  private async removeCookie(cookie: Cookie): Promise<void> {
    const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
    await this.driver.remote.deleteCookie(cookie.name, url);
  }
}
