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

commands.getLocation = async function (el) {
  el = el.ELEMENT ? el.ELEMENT : el;
  if (this.isWebContext()) {
    let atomsElement = await this.useAtomsElement(el);
    return await this.executeAtom('get_top_left_coordinates', [atomsElement]);
  } else {
    let rect = await this.proxyCommand(`/element/${el}/rect`, 'GET');
    return rect.origin;
  }
};

commands.getLocationInView = async function (el) {
  return await this.getLocation(el);
};

commands.getSize = async function (el) {
  el = el.ELEMENT ? el.ELEMENT : el;
  if (this.isWebContext()) {
    let atomsElement = this.getAtomsElement(el);
    if (atomsElement === null) {
      throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}'`);
    } else {
      return await this.executeAtom('get_size', [atomsElement]);
    }
  } else {
    let rect = await this.proxyCommand(`/element/${el}/rect`, 'GET');
    return rect.size;
  }
};


Object.assign(extensions, commands);
export { commands };
export default extensions;
