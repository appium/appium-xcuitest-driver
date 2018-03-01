import { errors, isErrorType } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';

let commands = {}, helpers = {}, extensions = {};

commands.getAlertText = async function () {
  try {
    return await this.proxyCommand('/alert/text', 'GET');
  } catch (err) {
    if (this.isWebContext()) {
      const alert = await this.getAlert();
      return await alert.getText();
    }
    throw err;
  }
};

commands.setAlertText = async function (value) {
  if (_.isString(value)) {
    value = value.split('');
  }
  try {
    return await this.proxyCommand('/alert/text', 'POST', {value});
  } catch (err) {
    if (this.isWebContext()) {
      const alert = await this.getAlert();
      return await alert.setText(value);
    }
    throw err;
  }
};

commands.postAcceptAlert = async function (opts = {}) {
  try {
    let params = {};
    if (opts.buttonLabel) {
      params.name = opts.buttonLabel;
    }
    return await this.proxyCommand('/alert/accept', 'POST', params);
  } catch (err) {
    if (!this.isWebContext()) {
      throw new errors.NoAlertOpenError(err.message);
    }

    let alert = await this.getAlert();
    if (alert.close) {
      return await alert.close();
    }
    await alert.ok();
  }
};

commands.postDismissAlert = async function (opts = {}) {
  try {
    let params = {};
    if (opts.buttonLabel) {
      params.name = opts.buttonLabel;
    }
    return await this.proxyCommand('/alert/dismiss', 'POST', params);
  } catch (err) {
    if (!this.isWebContext()) {
      throw new errors.NoAlertOpenError(err.message);
    }

    let alert = await this.getAlert();
    if (alert.close) {
      return await alert.close();
    }
    await alert.cancel();
  }
};

commands.getAlertButtons = async function () {
  try {
    return await this.proxyCommand('/wda/alert/buttons', 'GET');
  } catch (err) {
    throw new errors.NoAlertOpenError(err.message);
  }
};

commands.mobileHandleAlert = async function (opts = {}) {
  switch (opts.action) {
    case 'accept':
      return await this.postAcceptAlert(opts);
    case 'dismiss':
      return await this.postDismissAlert(opts);
    case 'getButtons':
      return await this.getAlertButtons();
    default:
      throw new Error(`The 'action' value should be either 'accept', 'dismiss' or 'getButtons'. ` +
                      `'${opts.action}' is provided instead.`);
  }
};

helpers.getAlert = async function () {
  let possibleAlert = await this.findNativeElementOrElements('class name', 'XCUIElementTypeScrollView', true);
  if (possibleAlert.length !== 1) {
    throw new errors.NoAlertOpenError();
  }

  let possibleAlertButtons = await this.findNativeElementOrElements('class name', 'XCUIElementTypeButton', true, possibleAlert[0].ELEMENT);
  if (possibleAlertButtons.length  < 1 || possibleAlertButtons.length > 2) {
    throw new errors.NoAlertOpenError();
  }

  let assertButtonName = async (button, expectedName) => {
    button = button.ELEMENT ? button.ELEMENT : button;
    let name = await this.proxyCommand(`/element/${button}/attribute/name`, 'GET');
    if (name.toLowerCase() !== expectedName) {
      throw new errors.NoAlertOpenError();
    }
  };

  let alert = possibleAlert[0];
  if (possibleAlertButtons.length === 1) {
    // make sure the button is 'Close'
    let closeButton = possibleAlertButtons[0];
    await assertButtonName(closeButton, 'close');

    alert.close = async () => {
      await this.proxyCommand(`/element/${closeButton.ELEMENT}/click`, 'POST');
    };
  } else {
    // ensure the buttons are 'Cancel' and 'OK'
    let cancelButton = possibleAlertButtons[0];
    await assertButtonName(cancelButton, 'cancel');
    let okButton = possibleAlertButtons[1];
    await assertButtonName(okButton, 'ok');

    alert.cancel = async () => {
      await this.proxyCommand(`/element/${cancelButton.ELEMENT}/click`, 'POST');
    };
    alert.ok = async () => {
      await this.proxyCommand(`/element/${okButton.ELEMENT}/click`, 'POST');
    };
  }

  alert.getText = async () => {
    let textView = await this.findNativeElementOrElements('class name', 'XCUIElementTypeTextView', false, util.unwrapElement(alert));
    return await this.proxyCommand(`/element/${textView.ELEMENT}/attribute/value`, 'GET');
  };
  alert.setText = async (value) => {
    try {
      let textView = await this.findNativeElementOrElements('class name', 'XCUIElementTypeTextField', false, util.unwrapElement(alert));
      await this.proxyCommand(`/element/${textView.ELEMENT}/value `, 'POST', {value});
    } catch (err) {
      if (isErrorType(err, errors.NoSuchElementError)) {
        throw new Error('Tried to set text of an alert that was not a prompt');
      }
      throw err;
    }
  };

  return alert;
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
