import _ from 'lodash';
import xmldom from 'xmldom';
import js2xml from 'js2xmlparser2';


let commands = {}, helpers = {}, extensions = {};

const APPIUM_SRC_XML = '<?xml version="1.0" encoding="UTF-8"?><AppiumAUT/>';


commands.getPageSource = async function getPageSource () {
  if (this.isWebContext()) {
    const script = 'return document.documentElement.outerHTML';
    return await this.executeAtom('execute_script', [script, []]);
  }

  if ((await this.settings.getSettings()).useJSONSource) {
    let srcTree = await this.mobileGetSource({format: 'json'});
    return getSourceXml(getTreeForXML(srcTree));
  }
  return await this.getNativePageSource();
};

helpers.getNativePageSource = async function getNativePageSource () {
  let srcTree = await this.proxyCommand('/source', 'GET');

  let parser = new xmldom.DOMParser();

  let tree = parser.parseFromString(srcTree);

  let doc = parser.parseFromString(APPIUM_SRC_XML);
  doc.documentElement.appendChild(tree.documentElement);

  return new xmldom.XMLSerializer().serializeToString(doc);
};

helpers.mobileGetSource = async function mobileGetSource (opts = {}) {
  if (!_.isString(opts.format)) {
    return await this.getNativePageSource();
  }
  const paramsMap = {
    format: opts.format,
  };
  if (opts.excludedAttributes) {
    paramsMap.excluded_attributes = opts.excludedAttributes;
  }
  const query = Object.entries(paramsMap)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return await this.proxyCommand(`/source?${query}`, 'GET');
};

/* Will get JSON of the form:
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
 */
function getTreeForXML (srcTree) {
  function getTree (element, elementIndex, parentPath) {
    let curPath = `${parentPath}/${elementIndex}`;
    let rect = element.rect || {};
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
      '>': []
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
      [`XCUIElementType${element.type}`]: subtree
    };
  }
  let tree = getTree(srcTree, 0, '');
  return tree;
}

function getSourceXml (jsonSource) {
  return js2xml('AppiumAUT', jsonSource, {
    wrapArray: {enabled: false, elementName: 'element'},
    declaration: {include: true},
    prettyPrinting: {indentString: '  '}
  });
}


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
