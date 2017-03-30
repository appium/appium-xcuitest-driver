import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';
import alertExtensions from './alert';
import sourceExtensions from './source';
import generalExtensions from './general';
import logExtensions from './log';
import webExtensions from './web';
import timeoutExtensions from './timeouts';
import navigationExtensions from './navigation';
import elementExtensions from './element';
import fileMovementExtensions from './file-movement';
import screenshotExtensions from './screenshots';


let commands = {};

Object.assign(commands, contextCommands, executeExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions, sourceExtensions,
  generalExtensions, logExtensions, webExtensions, timeoutExtensions,
  navigationExtensions, elementExtensions, fileMovementExtensions,
  alertExtensions, screenshotExtensions);

export default commands;
