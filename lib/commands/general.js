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
    nativeDriver.sendCommandWithSession('deactivateApp', durationObject, 'POST');
    //Deactivate app is sent to WebDriverAgent via POST to 'deactivateApp'

    //TODO: WebDriverAgent XCUITest does not yet support deactivate app with duration
};

export { commands };
export default commands;
