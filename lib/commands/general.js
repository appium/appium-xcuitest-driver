let commands = {};

/**
 * Simulate Touch ID with either valid fingerprint (match == true) or invalid
 * fingerprint (match == false).
 */
commands.touchId = async function (match) {
    let matchObject = {};
    if (match) {
      matchObject = {'match' : match};
    }
    this.wda.sendCommandWithSession('simulator/touch_id', matchObject, 'POST');
};

export { commands };
export default commands;
