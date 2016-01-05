import contextCommands from './context';
import generalExtensions from './general';
import gesture from './gesture';

let commands = {};

for (let obj of [contextCommands, generalExtensions, gesture]) {
  Object.assign(commands, obj);
}

export default commands;
