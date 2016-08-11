import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import { unwrapEl } from '../utils';


let commands = {}, extensions = {};
Object.assign(extensions, iosCommands.element);

commands.getAttribute = async function (attribute, el) {
  el = unwrapEl(el);
  if (!this.isWebContext()) {
    throw new errors.UnknownCommandError('This method should be proxied to WDA');
  }
  let atomsElement = this.getAtomsElement(el);
  if (_.isNull(atomsElement)) {
    throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}`);
  } else {
    return await this.executeAtom('get_attribute_value', [atomsElement, attribute]);
  }
};

commands.getText = async function (el) {
  el = unwrapEl(el);
  if (!this.isWebContext()) {
    throw new errors.UnknownCommandError('This method should be proxied to WDA');
  }
  let atomsElement = this.useAtomsElement(el);
  return await this.executeAtom('get_text', [atomsElement]);
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
