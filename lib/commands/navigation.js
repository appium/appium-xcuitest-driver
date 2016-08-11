import { errors } from 'appium-base-driver';


let commands = {}, helpers = {}, extensions = {};

commands.back = async function () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  await this.mobileWebNav('back');
};

commands.forward = async function () {
  if (!this.isWebContext()) {
  }
  await this.mobileWebNav('forward');
};

commands.closeWindow = async function () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  let script = "return window.open('','_self').close();";
  return await this.executeAtom('execute_script', [script, []], true);
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
