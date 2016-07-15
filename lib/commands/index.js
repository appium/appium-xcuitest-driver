import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';
import alertExtensions from './alert';
import sourceExtensions from './source';
import screenshotExtensions from './screenshot';
import generalExtensions from './general';

let commands = {};

Object.assign(commands, contextCommands, executeExtensions, alertExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions, sourceExtensions,
  screenshotExtensions, generalExtensions);

export default commands;
