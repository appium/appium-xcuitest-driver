import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';

let commands = {};

Object.assign(commands, contextCommands, executeExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions);

export default commands;
