let commands = {};

commands.getScreenshot = async function () {
  let method = 'GET';
  let endpoint = `/screenshot`;

  return await this.proxyCommand(endpoint, method);
};

export { commands};
export default commands;