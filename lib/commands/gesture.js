import logger from '../logger';

let commands = {};

/**
 * Perform touch command
 */
commands.performTouch = async function (gestures) {
  //Convert and pass on the touch command
  if (gestures.length === 1 && gestures[0].action === 'tap') {
    return await this.handleTap(gestures[0]);
  }
  //TODO: Handle multiple gestures, or anything else but tap
};

commands.handleTap = async function (gesture) {
  let options = gesture.options;

  let nativeDriver = await this.getNativeDriver();
  let gestureObject = {};
  if (options.x) {
    gestureObject.x = options.x;
  }
  if (options.y) {
    gestureObject.y = options.y;
  }
  let endpoint = 'tap';
  //Either an element or if there is none given, the WebDriverAgent API wants a param here
  if (options.element) {
    endpoint += '/' + options.element;
  } else {
    endpoint += '/0';
  }
  nativeDriver.sendCommandWithSession(endpoint, gestureObject, 'POST');
};

commands.parseTouch = function (gestures, cb) {
  logger.debug('PARSE TOUCH NOT IMPLEMENTED: ' + JSON.stringify(gestures));
  cb();
};

export { commands };
export default commands;
