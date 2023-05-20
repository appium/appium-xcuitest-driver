import xmldom from '@xmldom/xmldom';
import js2xml from 'js2xmlparser2';

const APPIUM_AUT_TAG = 'AppiumAUT';
const APPIUM_SRC_XML = `<?xml version="1.0" encoding="UTF-8"?><${APPIUM_AUT_TAG}/>`;
const APPIUM_TAG_PATTERN = new RegExp(`</?${APPIUM_AUT_TAG}/?>`);

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async getPageSource() {
    if (this.isWebContext()) {
      const script = 'return document.documentElement.outerHTML';
      return await this.executeAtom('execute_script', [script, []]);
    }

    if ((await this.settings.getSettings()).useJSONSource) {
      const srcTree = await this.mobileGetSource('json');
      return getSourceXml(getTreeForXML(srcTree));
    }
    return await this.getNativePageSource();
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async getNativePageSource() {
    const srcTree = /** @type {string} */ (
      await this.proxyCommand(`/source?scope=${APPIUM_AUT_TAG}`, 'GET')
    );
    if (APPIUM_TAG_PATTERN.test(srcTree)) {
      return srcTree;
    }
    // This might only happen if the driver is using an older/cached WDA
    // build (e.g. below 3.16.0)
    // TODO: remove this block after a while
    const parser = new xmldom.DOMParser();
    const tree = parser.parseFromString(srcTree);
    const doc = parser.parseFromString(APPIUM_SRC_XML);
    doc.documentElement.appendChild(tree.documentElement);
    return new xmldom.XMLSerializer().serializeToString(doc);
  },
  /**
   * Retrieve the source tree of the current page in XML or JSON format.
   *
   * @param {import('./types').SourceFormat} format - Page tree source representation format.
   * @param {string} [excludedAttributes] A comma-separated string of attribute names to exclude from the output. Only works if `format` is `xml`.
   * @privateRemarks Why isn't `excludedAttributes` an array?
   * @returns {Promise<string>} The source tree of the current page in the given format.
   * @this {XCUITestDriver}
   */
  async mobileGetSource(format = 'xml', excludedAttributes) {
    const paramsMap = {
      format,
      scope: APPIUM_AUT_TAG,
    };
    if (excludedAttributes) {
      paramsMap.excluded_attributes = excludedAttributes;
    }
    const query = Object.entries(paramsMap)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return /** @type {string} */ (await this.proxyCommand(`/source?${query}`, 'GET'));
  },
};
/**
 * Will get JSON of the form:
 *
 * ```js
 *   { isEnabled: '1',
 *     isVisible: '1',
 *     frame: '{{0, 0}, {375, 667}}',
 *     children:
 *      [ { isEnabled: '1',
 *          isVisible: '1',
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
function getTreeForXML(srcTree) {
  function getTree(element, elementIndex, parentPath) {
    let curPath = `${parentPath}/${elementIndex}`;
    let rect = element.rect || {};
    /**
     * @privateRemarks I don't even want to try to type this right now
     * @type {any}
     */
    let subtree = {
      '@': {
        type: `XCUIElementType${element.type}`,
        enabled: parseInt(element.isEnabled, 10) === 1,
        visible: parseInt(element.isVisible, 10) === 1,
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
  let tree = getTree(srcTree, 0, '');
  return tree;
}

function getSourceXml(jsonSource) {
  return js2xml('AppiumAUT', jsonSource, {
    wrapArray: {enabled: false, elementName: 'element'},
    declaration: {include: true},
    prettyPrinting: {indentString: '  '},
  });
}

export default {...helpers, ...commands};
/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
