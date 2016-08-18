import js2xml from "js2xmlparser2";


let commands = {}, helpers = {}, extensions = {};

// WDA uses a POST request to get the source. Until that
// is fixed, we need to translate the request
commands.getPageSource = async function () {
  if (this.isWebContext()) {
    let cmd = 'document.getElementsByTagName("html")[0].outerHTML';
    return await this.remote.execute(cmd);
  }

  let method = 'POST';
  let endpoint = `/source`;
  let srcTree = await this.proxyCommand(endpoint, method);

  // translate the returned value into what Appium expects
  let src = getSourceXml(getTreeForXML(srcTree));

  return src;
};

// { isEnabled: '1',
//   isVisible: '1',
//   frame: '{{0, 0}, {375, 667}}',
//   children:
//    [ { isEnabled: '1',
//        isVisible: '1',
//        frame: '{{0, 0}, {375, 667}}',
//        children: [],
//        rect: { origin: { x: 0, y: 0 }, size: { width: 375, height: 667 } },
//        value: null,
//        label: null,
//        type: 'Other',
//        name: null,
//        rawIdentifier: null },
//   rect: { origin: { x: 0, y: 0 }, size: { width: 375, height: 667 } },
//   value: null,
//   label: 'UICatalog',
//   type: 'Application',
//   name: 'UICatalog',
//   rawIdentifier: null }
function getTreeForXML (srcTree) {
  function getTree (element, elementIndex, parentPath) {
    let curPath = `${parentPath}/${elementIndex}`;
    let rect = element.rect;
    let subtree = {
      '@': {
        name: element.name || '',
        label: element.label || '',
        value: element.value,
        dom: null,
        enabled: element.isEnabled === 1 ? true : false,
        valid: true,
        visible: element.isVisible === 1 ? true : false,
        hint: element.hint || '',
        path: curPath,
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
      },
      '>': []
    };
    for (let i = 0; i < (element.children || []).length; i++) {
      subtree['>'].push(getTree(element.children[i], i, curPath));
    }
    return {
      [element.type]: subtree
    };
  }
  let tree = getTree(srcTree.tree, 0, '');
  return tree;
}

function getSourceXml (jsonSource) {
  return js2xml("AppiumAUT", jsonSource, {
    wrapArray: {enabled: false, elementName: 'element'},
    declaration: {include: true},
    prettyPrinting: {indentString: '    '}
  });
}


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
