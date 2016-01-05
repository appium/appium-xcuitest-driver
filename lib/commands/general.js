let commands = {};

/**
 * Close app (simulate device home button). If duration, app will re-open
 * after that duration
 */
commands.background = async function (duration) {
    let durationObject = {};
    if (duration) {
      durationObject = {'duration' : duration};
    }
    this.wda.sendCommandWithSession('deactivateApp', durationObject, 'POST');
};

export { commands };
export default commands;
