let commands = {};

/**
 * Close app (simulate device home button). If duration, app will re-open
 * after that duration
 */
commands.background = async function (duration) {
    let nativeDriver = await this.getNativeDriver();
    let durationObject = {};
    if (duration) {
      durationObject = {'duration' : duration};
    }
    //Deactivate app is sent to WebDriverAgent via POST to 'deactivateApp'
    nativeDriver.sendCommandWithSession('deactivateApp', durationObject, 'POST');
};

export { commands };
export default commands;
