import contextCommands from './context';
import generalExtensions from './general';
import gestureCommands from './gesture';

let commands = {};

for (let obj of [contextCommands, generalExtensions, gestureCommands]) {
  Object.assign(commands, obj);
}

export default commands;
