let commands = {}, helpers = {}, extensions = {};

commands.getAlertText = async function () {
  let method = 'GET';
  let endpoint = `/alert/text`;
  return await this.proxyCommand(endpoint, method);
};

// TODO: WDA does not currently support this natively
commands.setAlertText = async function (text) {
  let method = 'POST';
  let endpoint = `/alert/text`;
  return await this.proxyCommand(endpoint, method, text);
};

commands.postAcceptAlert = async function () {
  let method = 'POST';
  let endpoint = `/alert/accept`;
  return await this.proxyCommand(endpoint, method);
};

commands.postDismissAlert = async function () {
  let method = 'POST';
  let endpoint = `/alert/dismiss`;
  return await this.proxyCommand(endpoint, method);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
