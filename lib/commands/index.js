import contextCommands from './context';

let commands = {};

for (let obj of [contextCommands]) {
  Object.assign(commands, obj);
}

export default commands;
