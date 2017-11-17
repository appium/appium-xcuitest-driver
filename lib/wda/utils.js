import { fs, tempDir, plist } from 'appium-support';
import { exec } from 'teen_process';
import path from 'path';
import log from '../logger';
import _ from 'lodash';


const WDA_RUNNER_BUNDLE_ID = 'com.facebook.WebDriverAgentRunner';
const PROJECT_FILE = 'project.pbxproj';
const XCUICOORDINATE_FILE = 'PrivateHeaders/XCTest/XCUICoordinate.h';
const FBMACROS_FILE = 'WebDriverAgentLib/Utilities/FBMacros.h';
const XCUIAPPLICATION_FILE = 'PrivateHeaders/XCTest/XCUIApplication.h';
const FBSESSION_FILE = 'WebDriverAgentLib/Routing/FBSession.m';

async function replaceInFile (file, find, replace) {
  let contents = await fs.readFile(file, 'utf-8');

  let newContents = contents.replace(find, replace);
  if (newContents !== contents) {
    await fs.writeFile(file, newContents, 'utf-8');
  }
}

/**
 * Update WebDriverAgentRunner project bundle ID with newBundleId.
 * This method assumes project file is in the correct state.
 * @param {string} agentPath - Path to the .xcodeproj directory.
 * @param {string} newBundleId the new bundle ID used to update.
 */
async function updateProjectFile (agentPath, newBundleId) {
  let projectFilePath = `${agentPath}/${PROJECT_FILE}`;
  try {
    // Assuming projectFilePath is in the correct state, create .old from projectFilePath
    await fs.copyFile(projectFilePath, `${projectFilePath}.old`);
    await replaceInFile(projectFilePath, new RegExp(WDA_RUNNER_BUNDLE_ID.replace('.', '\.'), 'g'), newBundleId);
    log.debug(`Successfully updated '${projectFilePath}' with bundle id '${newBundleId}'`);
  } catch (err) {
    log.debug(`Error updating project file: ${err.message}`);
    log.warn(`Unable to update project file '${projectFilePath}' with ` +
             `bundle id '${newBundleId}'. WebDriverAgent may not start`);
  }
}

/**
 * Reset WebDriverAgentRunner project bundle ID to correct state.
 * @param {string} agentPath - Path to the .xcodeproj directory.
 */
async function resetProjectFile (agentPath) {
  let projectFilePath = `${agentPath}/${PROJECT_FILE}`;
  try {
    // restore projectFilePath from .old file
    if (!await fs.exists(`${projectFilePath}.old`)) {
      return;  // no need to reset
    }
    await fs.mv(`${projectFilePath}.old`, projectFilePath);
    log.debug(`Successfully reset '${projectFilePath}' with bundle id '${WDA_RUNNER_BUNDLE_ID}'`);
  } catch (err) {
    log.debug(`Error resetting project file: ${err.message}`);
    log.warn(`Unable to reset project file '${projectFilePath}' with ` +
             `bundle id '${WDA_RUNNER_BUNDLE_ID}'. WebDriverAgent has been ` +
             `modified and not returned to the original state.`);
  }
}

async function checkForDependencies (bootstrapPath, useSsl = false) {
  try {
    let carthagePath = await fs.which('carthage');
    log.debug(`Carthage found: '${carthagePath}'`);
  } catch (err) {
    log.errorAndThrow('Carthage binary is not found. Install using `brew install carthage` if it is not installed ' +
      'and make sure the root folder, where carthage binary is installed, is present in PATH environment variable. ' +
      `The current PATH value: '${process.env.PATH ? process.env.PATH : "<not defined for the Appium process>"}'`);
  }
  const carthageRoot = `${bootstrapPath}/Carthage`;
  if (!await fs.hasAccess(carthageRoot)) {
    log.debug('Running WebDriverAgent bootstrap script to install dependencies');
    try {
      let args = useSsl ? ['-d', '-D'] : ['-d'];
      await exec('Scripts/bootstrap.sh', args, {cwd: bootstrapPath});
    } catch (err) {
      // print out the stdout and stderr reports
      for (let std of ['stdout', 'stderr']) {
        for (let line of (err[std] || '').split('\n')) {
          if (!line.length) {
            continue;
          }
          log.error(line);
        }
      }
      // remove the carthage directory, or else subsequent runs will see it and
      // assume the dependencies are already downloaded
      await fs.rimraf(carthageRoot);

      throw err;
    }
  }
  if (!await fs.hasAccess(`${bootstrapPath}/Resources`)) {
    log.debug('Creating WebDriverAgent resources directory');
    await fs.mkdir(`${bootstrapPath}/Resources`);
  }
  if (!await fs.hasAccess(`${bootstrapPath}/Resources/WebDriverAgent.bundle`)) {
    log.debug('Creating WebDriverAgent resource bundle directory');
    await fs.mkdir(`${bootstrapPath}/Resources/WebDriverAgent.bundle`);
  }
}

async function setRealDeviceSecurity (keychainPath, keychainPassword) {
  log.debug('Setting security for iOS device');
  await exec('security', ['-v', 'list-keychains', '-s', keychainPath]);
  await exec('security', ['-v', 'unlock-keychain', '-p', keychainPassword, keychainPath]);
  await exec('security', ['set-keychain-settings', '-t', '3600', '-l', keychainPath]);
}

async function fixXCUICoordinateFile (bootstrapPath, initial = true) {
  // the way the updated XCTest headers are in the WDA project, building in
  // Xcode 8.0 causes a duplicate declaration of method
  // so fix the offending line in the local headers
  const file = path.resolve(bootstrapPath, XCUICOORDINATE_FILE);

  let oldDef = '- (void)pressForDuration:(double)arg1 thenDragToCoordinate:(id)arg2;';
  let newDef = '- (void)pressForDuration:(NSTimeInterval)duration thenDragToCoordinate:(XCUICoordinate *)otherCoordinate;';
  if (!initial) {
    [oldDef, newDef] = [newDef, oldDef];
  }
  await replaceInFile(file, oldDef, newDef);
}

async function fixFBSessionFile (bootstrapPath, initial = true) {
  const file = path.resolve(bootstrapPath, FBSESSION_FILE);

  let oldLine = 'return [FBApplication fb_activeApplication] ?: self.testedApplication;';
  let newLine = 'FBApplication *application = [FBApplication fb_activeApplication] ?: self.testedApplication;\n' +
                '  return application;';
  if (!initial) {
    [oldLine, newLine] = [newLine, oldLine];
  }
  await replaceInFile(file, oldLine, newLine);
}

async function fixForXcode7 (bootstrapPath, initial = true, fixXcode9 = true) {
  if (fixXcode9) {
    await fixForXcode9(bootstrapPath, !initial, false);
  }
  await fixXCUICoordinateFile(bootstrapPath, initial);
  await fixFBSessionFile(bootstrapPath, initial);
}

async function fixFBMacrosFile (bootstrapPath, initial = true) {
  const file = path.resolve(bootstrapPath, FBMACROS_FILE);

  let oldDef = '#define FBStringify(class, property) ({if(NO){[class.new property];} @#property;})';
  let newDef = '#define FBStringify(class, property) ({@#property;})';
  if (!initial) {
    [oldDef, newDef] = [newDef, oldDef];
  }
  await replaceInFile(file, oldDef, newDef);
}

async function fixXCUIApplicationFile (bootstrapPath, initial = true) {
  const file = path.resolve(bootstrapPath, XCUIAPPLICATION_FILE);

  let oldDef = '@property(nonatomic, readonly) NSUInteger state; // @synthesize state=_state;';
  let newDef = '@property XCUIApplicationState state;';
  if (!initial) {
    [oldDef, newDef] = [newDef, oldDef];
  }
  await replaceInFile(file, oldDef, newDef);
}

async function fixForXcode9 (bootstrapPath, initial = true, fixXcode7 = true) {
  if (fixXcode7) {
    await fixForXcode7(bootstrapPath, !initial, false);
  }
  await fixFBMacrosFile(bootstrapPath, initial);
  await fixXCUIApplicationFile(bootstrapPath, initial);
}

async function generateXcodeConfigFile (orgId, signingId) {
  log.debug(`Generating xcode config file for orgId '${orgId}' and signingId ` +
            `'${signingId}'`);
  let contents = `DEVELOPMENT_TEAM = ${orgId}
CODE_SIGN_IDENTITY = ${signingId}
`;
  let xcconfigPath = await tempDir.path('appium-temp.xcconfig');
  log.debug(`Writing xcode config file to ${xcconfigPath}`);
  await fs.writeFile(xcconfigPath, contents, "utf8");
  return xcconfigPath;
}

/**
 * Creates xctestrun file per device & platform version.
 * We expects to have WebDriverAgentRunner_iphoneos${platformVersion}-arm64.xctestrun for real device
 * and WebDriverAgentRunner_iphonesimulator${platformVersion}-x86_64.xctestrun for simulator located @bootstrapPath
 *
 * @param {boolean} isRealDevice - Equals to true if the current device is a real device
 * @param {string} udid - The device UDID.
 * @param {string} platformVersion - The platform version of OS.
 * @param {string} bootstrapPath - The folder path containing xctestrun file.
 * @param {string} wdaRemotePort - The remote port WDA is listening on.
 * @return {string} returns xctestrunFilePath for given device
 * @throws if WebDriverAgentRunner_iphoneos${platformVersion}-arm64.xctestrun for real device
 * or WebDriverAgentRunner_iphonesimulator${platformVersion}-x86_64.xctestrun for simulator is not found @bootstrapPath,
 * then it will throw file not found exception
 */
async function setXctestrunFile (isRealDevice, udid, platformVersion, bootstrapPath, wdaRemotePort) {
  let xctestrunDeviceFileName = `${udid}_${platformVersion}.xctestrun`;
  let xctestrunFilePath = path.resolve(bootstrapPath, xctestrunDeviceFileName);

  if (!await fs.exists(xctestrunFilePath)) {
    let xctestBaseFileName = isRealDevice ? `WebDriverAgentRunner_iphoneos${platformVersion}-arm64.xctestrun` :
      `WebDriverAgentRunner_iphonesimulator${platformVersion}-x86_64.xctestrun`;
    let originalXctestrunFile = path.resolve(bootstrapPath, xctestBaseFileName);
    if (!await fs.exists(originalXctestrunFile)) {
      log.errorAndThrow(`if you are using useXctestrunFile capability then you need to have ${originalXctestrunFile} file`);
    }
    // If this is first time run for given device, then first generate xctestrun file for device.
    // We need to have a xctestrun file per device because we cant not have same wda port for all devices.
    await fs.copyFile(originalXctestrunFile, xctestrunFilePath);
  }

  let xctestRunContent = await plist.parsePlistFile(xctestrunFilePath);

  let updateWDAPort = {
    WebDriverAgentRunner: {
      EnvironmentVariables: {
        USE_PORT: wdaRemotePort
      }
    }
  };

  let newXctestRunContent = _.merge(xctestRunContent, updateWDAPort);
  await plist.updatePlistFile(xctestrunFilePath, newXctestRunContent, true);

  return xctestrunFilePath;
}

async function killProcess (name, proc) {
  if (proc && proc.proc) {
    log.info(`Shutting down ${name} process (pid ${proc.proc.pid})`);
    try {
      await proc.stop('SIGTERM', 1000);
    } catch (err) {
      if (err.message.indexOf(`Process didn't end after`) === -1) {
        throw err;
      }
      log.debug(`${name} process did not end in a timely fashion: '${err.message}'. ` +
                `Sending 'SIGKILL'...`);
      try {
        await proc.stop('SIGKILL');
      } catch (err) {
        if (err.message.indexOf('not currently running') !== -1) {
          // the process ended but for some reason we were not informed
          return;
        }
        throw err;
      }
    }
  }
}

/**
 * Generate a random integer.
 *
 * @return {number} A random integer number in range [low, hight). `low`` is inclusive and `high` is exclusive.
 */
function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low) + low);
}

export { updateProjectFile, resetProjectFile, checkForDependencies,
         setRealDeviceSecurity, fixForXcode7, fixForXcode9,
         generateXcodeConfigFile, setXctestrunFile, killProcess, randomInt };
