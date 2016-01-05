import contextCommands from './context';
import generalExtensions from './general';

let commands = {};

for (let obj of [contextCommands, generalExtensions]) {
  Object.assign(commands, obj);
}

export default commands;
