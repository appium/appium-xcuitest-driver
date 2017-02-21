import xmldom from 'xmldom';


let commands = {}, helpers = {}, extensions = {};

const APPIUM_SRC_XML = '<?xml version="1.0" encoding="UTF-8"?><AppiumAUT/>';

// WDA uses a POST request to get the source. Until that
// is fixed, we need to translate the request
commands.getPageSource = async function () {
  if (this.isWebContext()) {
    let cmd = 'document.getElementsByTagName("html")[0].outerHTML';
    return await this.remote.execute(cmd);
  }

  return await this.getNativePageSource();
};

helpers.getNativePageSource = async function () {
  let srcTree = await this.proxyCommand('/source', 'GET');

  let parser = new xmldom.DOMParser();

  let tree = parser.parseFromString(srcTree);

  let doc = parser.parseFromString(APPIUM_SRC_XML);
  doc.documentElement.appendChild(tree.documentElement);

  return new xmldom.XMLSerializer().serializeToString(doc);
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
