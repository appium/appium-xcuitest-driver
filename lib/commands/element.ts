import _ from 'lodash';
import {errors} from 'appium/driver';
import {util} from 'appium/support';
import type {Element, Position, Size, Rect} from '@appium/types';
import type {XCUITestDriver} from '../driver';
import type {AtomsElement} from './types';

/**
 * Checks whether an element is displayed.
 *
 * @param el - Element or element ID
 */
export async function elementDisplayed(this: XCUITestDriver, el: Element | string): Promise<boolean> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(elementId);
    return await this.executeAtom('is_displayed', [atomsElement]) as boolean;
  }
  return await this.proxyCommand(`/element/${elementId}/displayed`, 'GET') as boolean;
}

/**
 * Checks whether an element is enabled.
 *
 * @param el - Element or element ID
 */
export async function elementEnabled(this: XCUITestDriver, el: Element | string): Promise<boolean> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(elementId);
    return await this.executeAtom('is_enabled', [atomsElement]) as boolean;
  }
  return await this.proxyCommand(`/element/${elementId}/enabled`, 'GET') as boolean;
}

/**
 * Checks whether an element is selected.
 *
 * @param el - Element or element ID
 */
export async function elementSelected(this: XCUITestDriver, el: Element | string): Promise<boolean> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(elementId);
    return await this.executeAtom('is_selected', [atomsElement]) as boolean;
  }
  return await this.proxyCommand(`/element/${elementId}/selected`, 'GET') as boolean;
}

/**
 * Gets the tag/name of an element.
 *
 * @param el - Element or element ID
 */
export async function getName(this: XCUITestDriver, el: Element | string): Promise<string> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(elementId);
    const script = 'return arguments[0].tagName.toLowerCase()';
    return await this.executeAtom('execute_script', [script, [atomsElement]]) as string;
  }
  return await this.proxyCommand(`/element/${elementId}/name`, 'GET') as string;
}

/**
 * Gets a native attribute (non-web) from an element.
 *
 * @param attribute - Attribute name
 * @param el - Element or element ID
 */
export async function getNativeAttribute(
  this: XCUITestDriver,
  attribute: string,
  el: Element | string,
): Promise<string | null> {
  if (attribute === 'contentSize') {
    return await this.getContentSize(el);
  }

  const elementId = util.unwrapElement(el);
  let value = await this.proxyCommand(`/element/${elementId}/attribute/${attribute}`, 'GET') as
    | string
    | number
    | null
    | undefined
    | boolean;
  if ([0, 1].includes(value as number)) {
    value = !!value;
  }
  return _.isNull(value) || _.isString(value) ? value : JSON.stringify(value);
}

/**
 * Gets an element attribute (web or native).
 *
 * @param attribute - Attribute name
 * @param el - Element or element ID
 */
export async function getAttribute(
  this: XCUITestDriver,
  attribute: string,
  el: Element | string,
): Promise<string | null> {
  const elementId = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.getNativeAttribute(attribute, elementId);
  }
  const atomsElement = this.getAtomsElement(elementId);
  return await this.executeAtom('get_attribute_value', [atomsElement, attribute]) as string | null;
}

/**
 * Gets an element property (web) or native attribute fallback.
 *
 * @param property - Property name
 * @param el - Element or element ID
 */
export async function getProperty(
  this: XCUITestDriver,
  property: string,
  el: Element | string,
): Promise<string | null> {
  const elementId = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.getNativeAttribute(property, elementId);
  }
  const atomsElement = this.getAtomsElement(elementId);
  return await this.executeAtom('get_attribute_value', [atomsElement, property]) as string | null;
}

/**
 * Gets the text content of an element.
 *
 * @param el - Element or element ID
 */
export async function getText(this: XCUITestDriver, el: Element | string): Promise<string> {
  const elementId = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.proxyCommand(`/element/${elementId}/text`, 'GET') as string;
  }
  const atomsElement = this.getAtomsElement(elementId);
  return await this.executeAtom('get_text', [atomsElement]) as string;
}

/**
 * Gets the bounding rect of an element.
 *
 * @param el - Element or element ID
 */
export async function getElementRect(this: XCUITestDriver, el: Element | string): Promise<Rect> {
  if (this.isWebContext()) {
    const {x, y} = await this.getLocation(el);
    const {width, height} = await this.getSize(el);
    return {x, y, width, height};
  }
  const elementId = util.unwrapElement(el);
  return await this.getNativeRect(elementId);
}

/**
 * Gets the top-left location of an element.
 *
 * @param elementId - Element or element ID
 */
export async function getLocation(this: XCUITestDriver, elementId: Element | string): Promise<Position> {
  const el = util.unwrapElement(elementId);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(el);
    const loc = await this.executeAtom('get_top_left_coordinates', [atomsElement]) as Position;
    if (this.opts.absoluteWebLocations) {
      const script =
        'return [' +
        'Math.max(window.pageXOffset,document.documentElement.scrollLeft,document.body.scrollLeft),' +
        'Math.max(window.pageYOffset,document.documentElement.scrollTop,document.body.scrollTop)];';
      const [xOffset, yOffset] = await this.execute(script) as [number, number];
      loc.x += xOffset;
      loc.y += yOffset;
    }
    return loc;
  }
  const rect = await this.getElementRect(el);
  return {x: rect.x, y: rect.y};
}

/**
 * Alias for getLocation.
 *
 * @param elementId - Element or element ID
 */
export async function getLocationInView(this: XCUITestDriver, elementId: Element | string): Promise<Position> {
  return await this.getLocation(elementId);
}

/**
 * Gets the size of an element.
 *
 * @param el - Element or element ID
 */
export async function getSize(this: XCUITestDriver, el: Element | string): Promise<Size> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    return await this.executeAtom('get_size', [this.getAtomsElement(elementId)]) as Size;
  }
  const rect = await this.getElementRect(elementId);
  return {width: rect.width, height: rect.height};
}

/**
 * Legacy alias for setValue; always types via keyboard.
 *
 * @param value - Value to set
 * @param el - Element or element ID
 */
export async function setValueImmediate(
  this: XCUITestDriver,
  value: string | string[] | number,
  el: Element | string,
): Promise<void> {
  this.log.info(
    'There is currently no way to bypass typing using XCUITest. Setting value through keyboard',
  );
  await this.setValue(value, el);
}

/**
 * Sets an element value (native or web).
 *
 * @param value - Value to set
 * @param el - Element or element ID
 */
export async function setValue(
  this: XCUITestDriver,
  value: string | string[] | number,
  el: Element | string,
): Promise<void> {
  const elementId = util.unwrapElement(el);
  if (!this.isWebContext()) {
    await this.proxyCommand(`/element/${elementId}/value`, 'POST', {
      value: prepareInputValue(value),
    });
    return;
  }

  const atomsElement = this.getAtomsElement(elementId);
  await this.executeAtom('click', [atomsElement]);

  if (this.opts.sendKeyStrategy !== 'oneByOne') {
    await this.setValueWithWebAtom(atomsElement, value);
    return;
  }
  for (const char of prepareInputValue(value)) {
    await this.setValueWithWebAtom(atomsElement, char);
  }
}

/**
 * Types text into a web element using atoms.
 *
 * @param atomsElement - Target atoms element
 * @param value - Text to type
 */
export async function setValueWithWebAtom(
  this: XCUITestDriver,
  atomsElement: AtomsElement<string>,
  value: string | string[] | number,
): Promise<void> {
  await this.executeAtom('type', [atomsElement, value]);

  if (this.opts.skipTriggerInputEventAfterSendkeys) {
    return;
  }

  function triggerInputEvent(input: EventTarget & {_valueTracker?: any}) {
    const lastValue = '';
    const event = new Event('input', {bubbles: true});
    const tracker = input._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    input.dispatchEvent(event);
  }

  const scriptAsString = `return (${triggerInputEvent}).apply(null, arguments)`;
  await this.executeAtom('execute_script', [scriptAsString, [atomsElement]]);
}

/**
 * Sends raw key sequences via WDA.
 *
 * @param value - Keys to send
 */
export async function keys(this: XCUITestDriver, value: string[] | string | number): Promise<void> {
  await this.proxyCommand('/wda/keys', 'POST', {
    value: prepareInputValue(value),
  });
}

/**
 * Clears the contents of an element.
 *
 * @param el - Element or element ID
 */
export async function clear(this: XCUITestDriver, el: Element | string): Promise<void> {
  const elementId = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(elementId);
    await this.executeAtom('clear', [atomsElement]);
    return;
  }
  await this.proxyCommand(`/element/${elementId}/clear`, 'POST');
}

/**
 * Gets content size for table/collection views (native only).
 *
 * @param el - Element or element ID
 */
export async function getContentSize(this: XCUITestDriver, el: Element | string): Promise<string> {
  if (this.isWebContext()) {
    throw new errors.NotYetImplementedError(
      'Support for getContentSize for web context is not yet implemented. Please contact an Appium dev',
    );
  }

  const type = await this.getAttribute('type', el);

  if (type !== 'XCUIElementTypeTable' && type !== 'XCUIElementTypeCollectionView') {
    throw new Error(
      `Can't get content size for type '${type}', only for tables and collection views`,
    );
  }
  let locator = '*';
  if (type === 'XCUIElementTypeTable') {
    locator = 'XCUIElementTypeCell';
  }

  let contentHeight = 0;
  const children = await this.findElOrEls('class chain', locator, true, el);
  if (children.length === 1) {
    const rect = await this.getElementRect(children[0]);
    contentHeight = rect.height;
  } else if (children.length) {
    switch (type) {
      case 'XCUIElementTypeTable': {
        const firstRect = await this.getElementRect(_.head(children) as Element);
        const lastRect = await this.getElementRect(_.last(children) as Element);
        contentHeight = lastRect.y + lastRect.height - firstRect.y;
        break;
      }
      case 'XCUIElementTypeCollectionView': {
        let elsInRow = 1;
        const firstRect = await this.getElementRect(_.head(children) as Element);
        const initialRects = [firstRect];
        for (let i = 1; i < children.length; i++) {
          const rect = await this.getElementRect(children[i] as Element);
          initialRects.push(rect);
          if (rect.y !== firstRect.y) {
            elsInRow = i;
            break;
          }
        }
        const spaceBetweenEls =
          initialRects[elsInRow].y -
          initialRects[elsInRow - 1].y -
          initialRects[elsInRow - 1].height;
        const numRows = Math.ceil(children.length / elsInRow);
        contentHeight = numRows * firstRect.height + spaceBetweenEls * (numRows - 1);
        break;
      }
      default:
        throw new Error(
          `Programming error: type '${type}' was not valid but should have already been rejected`,
        );
    }
  }
  const size = await this.getSize(el);
  const origin = await this.getLocationInView(el);
  return JSON.stringify({
    width: size.width,
    height: size.height,
    top: origin.y,
    left: origin.x,
    scrollableOffset: contentHeight,
  });
}

/**
 * Gets the native rect of an element (no web fallback).
 *
 * @param el - Element or element ID
 */
export async function getNativeRect(this: XCUITestDriver, el: Element | string): Promise<Rect> {
  const elementId = util.unwrapElement(el);
  return await this.proxyCommand(`/element/${elementId}/rect`, 'GET') as Rect;
}

function prepareInputValue(inp: string | string[] | number): string[] {
  if (![_.isArray, _.isString, _.isFinite].some((f) => f(inp))) {
    throw new Error(
      `Only strings, numbers and arrays are supported as input arguments. ` +
        `Received: ${JSON.stringify(inp)}`,
    );
  }

  if (_.isArray(inp)) {
    inp = inp.join('');
  } else if (_.isFinite(inp)) {
    inp = `${inp}`;
  }
  return [...String(inp)].map((k) => {
    if (['\uE006', '\uE007'].includes(k)) {
      return '\n';
    }
    if (['\uE003', '\ue017'].includes(k)) {
      return '\b';
    }
    return k;
  });
}
