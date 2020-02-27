import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';

let commands = {}, helpers = {}, extensions = {};

commands.getAlertText = async function getAlertText () {
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

commands.setAlertText = async function setAlertText (value) {
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

commands.postAcceptAlert = async function postAcceptAlert (opts = {}) {
  try {
    let params = {};
    if (opts.buttonLabel) {
      params.name = opts.buttonLabel;
    }
    return await this.proxyCommand('/alert/accept', 'POST', params);
  } catch (err) {
    if (!this.isWebContext()) {
      throw new errors.NoAlertOpenError();
    }

    let alert = await this.getAlert();
    if (alert.close) {
      return await alert.close();
    }
    await alert.ok();
  }
};

commands.postDismissAlert = async function postDismissAlert (opts = {}) {
  try {
    let params = {};
    if (opts.buttonLabel) {
      params.name = opts.buttonLabel;
    }
    return await this.proxyCommand('/alert/dismiss', 'POST', params);
  } catch (err) {
    if (!this.isWebContext()) {
      throw new errors.NoAlertOpenError();
    }

    let alert = await this.getAlert();
    if (alert.close) {
      return await alert.close();
    }
    await alert.cancel();
  }
};

commands.getAlertButtons = async function getAlertButtons () {
  try {
    return await this.proxyCommand('/wda/alert/buttons', 'GET');
  } catch (err) {
    throw new errors.NoAlertOpenError();
  }
};

commands.mobileHandleAlert = async function mobileHandleAlert (opts = {}) {
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

helpers.getAlert = async function getAlert () {
  // the alert ought to be the first scroll view, but we do not want to
  // wait for any implicit wait so get multiple
  const scrollViews = await this.findNativeElementOrElements('class name',
    'XCUIElementTypeScrollView', true);
  if (scrollViews.length !== 1) {
    throw new errors.NoAlertOpenError();
  }

  // if there is an alert, it will be the first scroll view
  const alert = scrollViews[0];

  // within the alert there should be one or two buttons (no more, no less)
  const possibleAlertButtons = await this.findNativeElementOrElements('class name',
    'XCUIElementTypeButton', true, util.unwrapElement(alert));
  if (possibleAlertButtons.length < 1 || possibleAlertButtons.length > 2) {
    throw new errors.NoAlertOpenError();
  }

  // determine that the name of the button is what is expected
  const assertButtonName = async (button, expectedName = '') => {
    button = util.unwrapElement(button);
    const name = await this.proxyCommand(`/element/${button}/attribute/name`, 'GET');
    if (name?.toLowerCase() !== expectedName.toLowerCase()) {
      throw new errors.NoAlertOpenError();
    }
  };

  if (possibleAlertButtons.length === 1) {
    // make sure the button is 'Close'
    const closeButton = possibleAlertButtons[0];
    await assertButtonName(closeButton, 'close');

    // add a function on the alert to close by clicking the 'Close' button
    alert.close = async () => {
      await this.proxyCommand(`/element/${util.unwrapElement(closeButton)}/click`, 'POST');
    };
  } else {
    // ensure the buttons are 'Cancel' and 'OK'
    const firstButton = possibleAlertButtons[0];
    await assertButtonName(firstButton, 'cancel');
    const secondButton = possibleAlertButtons[1];
    await assertButtonName(secondButton, 'ok');

    // add cancel function to the alert, clicking the 'Cancel' button
    alert.cancel = async () => {
      await this.proxyCommand(`/element/${util.unwrapElement(firstButton)}/click`, 'POST');
    };
    // add ok function to the alert, clicking the 'OK' button
    alert.ok = async () => {
      await this.proxyCommand(`/element/${util.unwrapElement(secondButton)}/click`, 'POST');
    };
  }

  // add getText function to the alert, getting the value of the correct element
  alert.getText = async () => {
    // iOS up to 13.3 will report a single text view, while 13.4 will have two
    // but the _last_ one will be the one presenting the text of the alert
    const textViews = await this.findNativeElementOrElements('class name', 'XCUIElementTypeTextView', true, util.unwrapElement(alert));
    return await this.proxyCommand(`/element/${util.unwrapElement(_.last(textViews))}/attribute/value`, 'GET');
  };
  // add setText function to the alert, setting the value of the text field element
  alert.setText = async (value) => {
    const textViews = await this.findNativeElementOrElements('class name', 'XCUIElementTypeTextField', true, util.unwrapElement(alert));
    if (textViews.length === 0) {
      throw new Error('Tried to set text of an alert that was not a prompt');
    }
    await this.proxyCommand(`/element/${util.unwrapElement(textViews[0])}/value `, 'POST', {value});
  };

  return alert;
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
