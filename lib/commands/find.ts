import _ from 'lodash';
import {CssConverter} from '../css-converter';
import {errors} from 'appium/driver';
import {util} from 'appium/support';
import type {Element, AppiumLogger} from '@appium/types';
import type {XCUITestDriver} from '../driver';
import type {AllowedHttpMethod} from './proxy-helper';

/**
 * Finds elements, delegating to web or native based on context.
 */
export async function findElOrEls(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: true,
  context?: any,
): Promise<Element[]>;
export async function findElOrEls(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: false,
  context?: any,
): Promise<Element>;
export async function findElOrEls(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]>;
export async function findElOrEls(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]>;
export async function findElOrEls(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]> {
  if (this.isWebview()) {
    return mult
      ? await this.findWebElementOrElements(strategy, selector, true, context)
      : await this.findWebElementOrElements(strategy, selector, false, context);
  }
  return mult
    ? await this.findNativeElementOrElements(strategy, selector, true, context)
    : await this.findNativeElementOrElements(strategy, selector, false, context);
}

/**
 * Finds elements natively with strategy/selector rewriting for WDA.
 */
export async function findNativeElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: true,
  context?: any,
): Promise<Element[]>;
export async function findNativeElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: false,
  context?: any,
): Promise<Element>;
export async function findNativeElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]>;
export async function findNativeElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]> {
  const initSelector = selector;
  let rewroteSelector = false;
  if (strategy === '-ios predicate string') {
    strategy = 'predicate string';
  } else if (strategy === '-ios class chain') {
    strategy = WDA_CLASS_CHAIN_STRATEGY;
  } else if (strategy === 'css selector') {
    strategy = WDA_CLASS_CHAIN_STRATEGY;
    selector = CssConverter.toIosClassChainSelector(selector);
  }

  if (strategy === 'class name') {
    if (selector.startsWith('UIA')) {
      selector = selector.substring(3);
    }
    if (!selector.startsWith('XCUIElementType')) {
      selector = stripViewFromSelector(`XCUIElementType${selector}`);
      rewroteSelector = true;
    }
  }

  if (strategy === 'xpath' && MAGIC_FIRST_VIS_CHILD_SEL.test(selector)) {
    return await this.getFirstVisibleChild(mult, context);
  } else if (strategy === 'xpath' && MAGIC_SCROLLABLE_SEL.test(selector)) {
    [strategy, selector] = rewriteMagicScrollable(mult, this.log);
  } else if (strategy === 'xpath') {
    selector = selector.replace(/(^|\/)(UIA)([^[/]+)/g, (str, g1, _g2, g3) => {
      rewroteSelector = true;
      return g1 + stripViewFromSelector(`XCUIElementType${g3}`);
    });
  }

  if (rewroteSelector) {
    this.log.info(
      `Rewrote incoming selector from '${initSelector}' to ` +
        `'${selector}' to match XCUI type. You should consider ` +
        `updating your tests to use the new selectors directly`,
    );
  }

  return mult
    ? await this.doNativeFind(strategy, selector, true, context)
    : await this.doNativeFind(strategy, selector, false, context);
}

/**
 * Finds elements natively and returns either a single element or an array depending on `mult`.
 *
 * Returns an array when `mult` is true; otherwise returns a single element.
 */
export async function doNativeFind(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: true,
  context?: any,
): Promise<Element[]>;
export async function doNativeFind(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: false,
  context?: any,
): Promise<Element>;
export async function doNativeFind(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]>;
export async function doNativeFind(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]>;
export async function doNativeFind(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  mult: boolean,
  context?: any,
): Promise<Element | Element[]> {
  const ctx = util.unwrapElement(context ?? null);
  const endpoint = `/element${ctx ? `/${ctx}/element` : ''}${mult ? 's' : ''}`;

  const body = {
    using: strategy,
    value: selector,
  };

  const method: AllowedHttpMethod = 'POST';

  let els: Element[] | Element = [];
  try {
    await this.implicitWaitForCondition(async () => {
      try {
        els = (await this.proxyCommand(endpoint, method, body)) as Element[] | Element;
      } catch {
        els = [] as Element[];
      }
      return !_.isEmpty(els as any[]);
    });
  } catch (err: any) {
    if (err.message?.match(/Condition unmet/)) {
      els = [] as Element[];
    } else {
      throw err;
    }
  }
  if (mult) {
    return Array.isArray(els) ? els : [els];
  }
  if (Array.isArray(els)) {
    if (_.isEmpty(els)) {
      throw new errors.NoSuchElementError();
    }
    return els[0];
  }
  if (!els) {
    throw new errors.NoSuchElementError();
  }
  return els;
}

/**
 * Finds the first visible child element inside a context.
 */
export async function getFirstVisibleChild(
  this: XCUITestDriver,
  mult: boolean,
  context: Element | string | null,
): Promise<Element> {
  this.log.info(`Getting first visible child`);
  if (mult) {
    throw new Error('Cannot get multiple first visible children!');
  }
  if (!context) {
    throw new Error('Cannot get first visible child without a context element');
  }
  let index = 1;
  while (true) {
    const strategy = WDA_CLASS_CHAIN_STRATEGY;
    const selector = `*[${index}]`;
    const nthChild = (await this.doNativeFind(strategy, selector, false, context)) as Element;
    const visible = await this.getAttribute('visible', nthChild);
    if (visible === 'true') {
      this.log.info(`Found first visible child at position ${index}`);
      return nthChild;
    }
    index++;
  }
}

const MAGIC_FIRST_VIS_CHILD_SEL = /\/\*\[@firstVisible\s*=\s*('|")true\1\]/;
const MAGIC_SCROLLABLE_SEL = /\/\/\*\[@scrollable\s*=\s*('|")true\1\]/;
const WDA_CLASS_CHAIN_STRATEGY = 'class chain';

function stripViewFromSelector(selector: string): string {
  const keepView = [
    'XCUIElementTypeScrollView',
    'XCUIElementTypeCollectionView',
    'XCUIElementTypeTextView',
    'XCUIElementTypeWebView',
  ].includes(selector);

  if (!keepView && selector.indexOf('View') === selector.length - 4) {
    return selector.substring(0, selector.length - 4);
  }
  return selector;
}

function rewriteMagicScrollable(mult: boolean, log: AppiumLogger | null = null): [string, string] {
  const pred = ['ScrollView', 'Table', 'CollectionView', 'WebView']
    .map((t) => `type == "XCUIElementType${t}"`)
    .join(' OR ');
  const strategy = WDA_CLASS_CHAIN_STRATEGY;
  let selector = '**/*[`' + pred + '`]';
  if (!mult) {
    selector += '[1]';
  }
  log?.info(
    'Rewrote request for scrollable descendants to class chain ' +
      `format with selector '${selector}'`,
  );
  return [strategy, selector];
}
