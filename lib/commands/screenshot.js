import { getScreenshot } from 'node-simctl';


let commands = {}, helpers = {}, extensions = {};

commands.getScreenshot = async function () {
  let screenshot;

  try {
    screenshot = await getScreenshot(this.opts.udid);
  } catch (e) {
    return this.proxyCommand('/screenshot', '/GET');
  }
  return screenshot;
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;