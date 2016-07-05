import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';
import alertExtensions from './alert';

let commands = {};

Object.assign(commands, contextCommands, executeExtensions, alertExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions);

export default commands;
