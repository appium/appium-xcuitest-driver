import {fs} from 'appium/support';

const XCRUN = 'xcrun';

async function requireXcrun() {
  try {
    return await fs.which(XCRUN);
  } catch (e) {
    throw new Error(
      `${XCRUN} has not been found in PATH. ` +
        `Please make sure XCode development tools are installed`,
    );
  }
}

export {requireXcrun, XCRUN};
