import contextCommands from './context';
import gestureCommands from './gesture';

let commands = {};

for (let obj of [contextCommands, gestureCommands]) {
  Object.assign(commands, obj);
}

export default commands;
