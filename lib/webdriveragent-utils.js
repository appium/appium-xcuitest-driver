import { fs } from 'appium-support';
import { exec } from 'teen_process';
import path from 'path';
import log from './logger';


const WDA_RUNNER_BUNDLE_ID = 'com.facebook.WebDriverAgentRunner';
const PROJECT_FILE = 'project.pbxproj';
const XCUICOORDINATE_FILE = 'PrivateHeaders/XCTest/XCUICoordinate.h';

async function replaceInFile (file, find, replace) {
  let contents = await fs.readFile(file, 'utf-8');

  let newContents = contents.replace(find, replace);
  if (newContents !== contents) {
    await fs.writeFile(file, newContents, 'utf-8');
  }
}

async function updateProjectFile (agentPath, newBundleId) {
  let projectFilePath = `${agentPath}/${PROJECT_FILE}`;
  try {
    // backup the file, and then update the bundle id for the runner
    await fs.copyFile(projectFilePath, `${projectFilePath}.old`);
    await replaceInFile(projectFilePath, new RegExp(WDA_RUNNER_BUNDLE_ID.replace('.', '\.'), 'g'), newBundleId); // jshint ignore:line
    log.debug(`Successfully updated '${projectFilePath}' with bundle id '${newBundleId}'`);
  } catch (err) {
    log.debug(`Error updating project file: ${err.message}`);
    log.warn(`Unable to update project file '${projectFilePath}' with ` +
             `bundle id '${newBundleId}'. WebDriverAgent may not start`);
  }
}

async function resetProjectFile (agentPath, newBundleId) {
  let projectFilePath = `${agentPath}/${PROJECT_FILE}`;
  try {
    await replaceInFile(projectFilePath, new RegExp(newBundleId.replace('.', '\.'), 'g'), WDA_RUNNER_BUNDLE_ID); // jshint ignore:line
    await fs.unlink(`${projectFilePath}.old`);
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
    log.warn('Carthage not found. Install using `brew install carthage`');
  }
  if (!await fs.hasAccess(`${bootstrapPath}/Carthage`)) {
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
      await fs.rimraf(`${bootstrapPath}/Carthage`);

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

async function fixForXcode7 (bootstrapPath, initial = true) {
  await fixXCUICoordinateFile(bootstrapPath, initial);
}

export { updateProjectFile, resetProjectFile, checkForDependencies,
         setRealDeviceSecurity, fixForXcode7 };
