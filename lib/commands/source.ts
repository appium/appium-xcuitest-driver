import _ from 'lodash';
import js2xml from 'js2xmlparser2';
import type {XCUITestDriver} from '../driver';
import type {SourceFormat} from './types';

const APPIUM_AUT_TAG = 'AppiumAUT';

/**
 * Retrieves the page source of the current application.
 *
 * @returns The page source as XML or HTML string
 */
export async function getPageSource(this: XCUITestDriver): Promise<string> {
  if (this.isWebContext()) {
    const script = 'return document.documentElement.outerHTML';
    return await this.executeAtom('execute_script', [script, []]);
  }

  const {
    pageSourceExcludedAttributes: excludedAttributes,
    useJSONSource
  } = await this.settings.getSettings();
  const hasExcludedAttributes = _.isString(excludedAttributes) && !_.isEmpty(excludedAttributes);
  if (useJSONSource) {
    const srcTree = await this.mobileGetSource('json', hasExcludedAttributes ? excludedAttributes : undefined);
    return getSourceXml(getTreeForXML(srcTree));
  }

  return await this.mobileGetSource('xml', hasExcludedAttributes ? excludedAttributes : undefined);
}

/**
 * Retrieve the source tree of the current page in XML or JSON format.
 *
 * @param format - Page tree source representation format.
 * @param excludedAttributes - A comma-separated string of attribute names to exclude from the output. Only works if `format` is `xml`.
 * @privateRemarks Why isn't `excludedAttributes` an array?
 * @returns The source tree of the current page in the given format.
 */
export async function mobileGetSource(
  this: XCUITestDriver,
  format: SourceFormat = 'xml',
  excludedAttributes?: string,
): Promise<string> {
  const paramsMap: Record<string, string> = {
    format,
    scope: APPIUM_AUT_TAG,
  };
  if (excludedAttributes) {
    paramsMap.excluded_attributes = excludedAttributes;
  }
  const query = Object.entries(paramsMap)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return await this.proxyCommand(`/source?${query}`, 'GET') as string;
}

/**
 * Will get JSON of the form:
 *
 * ```js
 *   { isEnabled: '1',
 *     isVisible: '1',
 *     isAccessible: '1',
 *     frame: '{{0, 0}, {375, 667}}',
 *     children:
 *      [ { isEnabled: '1',
 *          isVisible: '1',
 *          isAccessible: '1',
 *          frame: '{{0, 0}, {375, 667}}',
 *          children: [],
 *          rect: { x: 0, y: 0, width: 375, height: 667 },
 *          value: null,
 *          label: null,
 *          type: 'Other',
 *          name: null,
 *          rawIdentifier: null },
 *     rect: { origin: { x: 0, y: 0 }, size: { width: 375, height: 667 } },
 *     value: null,
 *     label: 'UICatalog',
 *     type: 'Application',
 *     name: 'UICatalog',
 *     rawIdentifier: null }
 * ```
 */
function getTreeForXML(srcTree: any): any {
  function getTree(element: any, elementIndex: number, parentPath: string): any {
    const curPath = `${parentPath}/${elementIndex}`;
    const rect = element.rect || {};
    /**
     * @privateRemarks I don't even want to try to type this right now
     */
    const subtree: any = {
      '@': {
        type: `XCUIElementType${element.type}`,
        enabled: parseInt(element.isEnabled, 10) === 1,
        visible: parseInt(element.isVisible, 10) === 1,
        accessible: parseInt(element.isAccessible, 10) === 1,
        focused: parseInt(element.isFocused, 10) === 1,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      '>': [],
    };
    if (element.name !== null) {
      subtree['@'].name = element.name;
    }
    if (element.label !== null) {
      subtree['@'].label = element.label;
    }
    if (element.value !== null) {
      subtree['@'].value = element.value;
    }
    for (let i = 0; i < (element.children || []).length; i++) {
      subtree['>'].push(getTree(element.children[i], i, curPath));
    }
    return {
      [`XCUIElementType${element.type}`]: subtree,
    };
  }
  const tree = getTree(srcTree, 0, '');
  return tree;
}

function getSourceXml(jsonSource: any): string {
  return js2xml('AppiumAUT', jsonSource, {
    wrapArray: {enabled: false, elementName: 'element'},
    declaration: {include: true},
    prettyPrinting: {indentString: '  '},
  });
}

