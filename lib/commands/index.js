import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';
import alertExtensions from './alert';
import sourceExtensions from './source';
import generalExtensions from './general';
import logExtensions from './log';

let commands = {};

Object.assign(commands, contextCommands, executeExtensions, alertExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions, sourceExtensions,
  generalExtensions, logExtensions);

export default commands;
