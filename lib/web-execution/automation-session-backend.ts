import type {ActionSequence, Cookie, Element, Rect} from '@appium/types';
import type {AutomationSession, LocatorStrategy} from 'appium-remote-debugger';
import {errors} from 'appium/driver.js';
import {util} from 'appium/support.js';

import type {WebExecutionBackend} from './types.js';

/**
 * Routes web-execution commands through a live `appium-remote-debugger` `AutomationSession`.
 *
 * Almost pure delegation: elements cross the wire in the exact same W3C shape Appium's own
 * wire protocol uses, built from WebKit's own opaque per-session node handle, so there is no
 * element cache here (unlike {@linkcode AtomsBackend}) - just `util.wrapElement`/`unwrapElement`
 * on the way in and out.
 */
export class AutomationSessionBackend implements WebExecutionBackend {
  private readonly session: AutomationSession;

  constructor(session: AutomationSession) {
    this.session = session;
  }

  async findElement(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element> {
    const root = ctx == null ? undefined : util.wrapElement(util.unwrapElement(ctx));
    const el = await this.session.findElement(strategy as LocatorStrategy, selector, root);
    if (!el) {
      throw new errors.NoSuchElementError();
    }
    return el;
  }

  async findElements(strategy: string, selector: string, ctx?: Element | string | null): Promise<Element[]> {
    const root = ctx == null ? undefined : util.wrapElement(util.unwrapElement(ctx));
    return await this.session.findElements(strategy as LocatorStrategy, selector, root);
  }

  async click(elementId: string): Promise<void> {
    await this.session.click(util.wrapElement(elementId));
  }

  async clear(elementId: string): Promise<void> {
    await this.session.clear(util.wrapElement(elementId));
  }

  async sendKeys(elementId: string, value: string | string[] | number): Promise<void> {
    const text = Array.isArray(value) ? value.join('') : String(value);
    await this.session.sendKeys(util.wrapElement(elementId), text);
  }

  async submit(elementId: string): Promise<void> {
    await this.session.submit(util.wrapElement(elementId));
  }

  async getText(elementId: string): Promise<string> {
    return await this.session.getText(util.wrapElement(elementId));
  }

  async getTagName(elementId: string): Promise<string> {
    return await this.session.getTagName(util.wrapElement(elementId));
  }

  async getAttribute(elementId: string, name: string): Promise<string | null> {
    return await this.session.getAttribute(util.wrapElement(elementId), name);
  }

  async getProperty(elementId: string, name: string): Promise<string | null> {
    return await this.session.getProperty(util.wrapElement(elementId), name);
  }

  async getCssValue(elementId: string, propertyName: string): Promise<string> {
    return await this.session.getCssValue(util.wrapElement(elementId), propertyName);
  }

  async isDisplayed(elementId: string): Promise<boolean> {
    return await this.session.isDisplayed(util.wrapElement(elementId));
  }

  async isEnabled(elementId: string): Promise<boolean> {
    return await this.session.isEnabled(util.wrapElement(elementId));
  }

  async isSelected(elementId: string): Promise<boolean> {
    return await this.session.isSelected(util.wrapElement(elementId));
  }

  async getRect(elementId: string): Promise<Rect> {
    return await this.session.getRect(util.wrapElement(elementId));
  }

  async elementScreenshot(elementId: string): Promise<string> {
    return await this.session.elementScreenshot(util.wrapElement(elementId));
  }

  async navigate(url: string): Promise<void> {
    await this.session.navigate(url);
  }

  async back(): Promise<void> {
    await this.session.back();
  }

  async forward(): Promise<void> {
    await this.session.forward();
  }

  async refresh(): Promise<void> {
    await this.session.refresh();
  }

  async getCurrentUrl(): Promise<string> {
    return await this.session.getCurrentUrl();
  }

  async getTitle(): Promise<string> {
    return await this.session.getTitle();
  }

  async getPageSource(): Promise<string> {
    return await this.session.getPageSource();
  }

  async switchToFrame(target: number | Element | string): Promise<void> {
    if (typeof target === 'number') {
      await this.session.switchToFrame(target);
      return;
    }
    if (typeof target === 'string') {
      throw new errors.NotImplementedError(
        `Switching into a frame by name or id is not supported once an automation session is ` +
          `active. Use a frame index or a frame element instead.`,
      );
    }
    await this.session.switchToFrame(util.wrapElement(util.unwrapElement(target)));
  }

  async switchToParentFrame(): Promise<void> {
    await this.session.switchToParentFrame();
  }

  async switchToDefaultContent(): Promise<void> {
    await this.session.switchToDefaultContent();
  }

  async getActiveElement(): Promise<Element | null> {
    return await this.session.getActiveElement();
  }

  async getWindowHandle(): Promise<string> {
    const handle = this.session.currentWindowHandle;
    if (!handle) {
      throw new errors.InvalidContextError();
    }
    return handle;
  }

  async getWindowHandles(): Promise<string[]> {
    return await this.session.getWindowHandles();
  }

  async getWindowRect(): Promise<Rect> {
    return await this.session.getWindowRect();
  }

  async setWindowRect(x?: number, y?: number, width?: number, height?: number): Promise<void> {
    await this.session.setWindowRect(x, y, width, height);
  }

  async maximizeWindow(): Promise<void> {
    await this.session.maximizeWindow();
  }

  async minimizeWindow(): Promise<void> {
    await this.session.minimizeWindow();
  }

  async fullscreenWindow(): Promise<void> {
    await this.session.fullscreenWindow();
  }

  async closeWindow(): Promise<void> {
    await this.session.closeWindow();
  }

  async getCookies(): Promise<Cookie[]> {
    return (await this.session.getCookies()) as Cookie[];
  }

  async addCookie(cookie: Cookie): Promise<void> {
    await this.session.addCookie(cookie);
  }

  async deleteCookie(name: string): Promise<void> {
    await this.session.deleteCookie(name);
  }

  async deleteAllCookies(): Promise<void> {
    await this.session.deleteAllCookies();
  }

  async executeScript<T = unknown>(script: string, args: unknown[] = []): Promise<T> {
    return await this.session.executeScript<T>(script, args);
  }

  async executeAsyncScript<T = unknown>(script: string, args: unknown[] = []): Promise<T> {
    return await this.session.executeAsyncScript<T>(script, args);
  }

  async screenshot(): Promise<string> {
    return await this.session.screenshot();
  }

  async performActions(actions: ActionSequence[]): Promise<void> {
    await this.session.performW3CActions(actions);
  }

  async releaseActions(): Promise<void> {
    await this.session.releaseActions();
  }

  async isShowingJavaScriptDialog(): Promise<boolean> {
    return await this.session.isShowingJavaScriptDialog();
  }

  async getDialogMessage(): Promise<string> {
    return await this.session.getDialogMessage();
  }

  async acceptDialog(): Promise<void> {
    await this.session.acceptDialog();
  }

  async dismissDialog(): Promise<void> {
    await this.session.dismissDialog();
  }

  async setDialogUserInput(userInput: string): Promise<void> {
    await this.session.setDialogUserInput(userInput);
  }

  async getAlertButtons(): Promise<string[]> {
    throw new errors.NotImplementedError(
      `JavaScript dialogs have fixed native buttons; their labels are not enumerable.`,
    );
  }
}
