import { setPasteboard, getPasteboard } from 'node-simctl';

let commands = {};

commands.mobileSetPasteboard = async function (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Setting pasteboard content is not supported on real devices');
  }
  const {content, encoding} = opts;
  if (!content) {
    throw new Error('Pasteboard content is mandatory to set');
  }
  return await setPasteboard(content, encoding);
};

commands.mobileGetPasteboard = async function (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Getting pasteboard content is not supported on real devices');
  }
  const {encoding} = opts;
  return await getPasteboard(encoding);
};

export { commands };
export default commands;
