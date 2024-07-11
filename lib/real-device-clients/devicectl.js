import {exec, SubProcess} from 'teen_process';
import {util} from 'appium/support';
import _ from 'lodash';

const XCRUN = 'xcrun';

/**
 * @typedef {Object} ProcessInfo
 * @property {number} processIdentifier
 * @property {string} executable
 */

/*
  Example:
    {
      "executable" : "file:///sbin/launchd",
      "processIdentifier" : 1
    },
*/

/**
 * @typedef {Object} AppInfo
 * @property {boolean} appClip
 * @property {boolean} builtByDeveloper
 * @property {string} bundleIdentifier
 * @property {string} bundleVersion
 * @property {boolean} defaultApp
 * @property {boolean} hidden
 * @property {boolean} internalApp
 * @property {string} name
 * @property {boolean} removable
 * @property {string} url
 * @property {string} version
 */

/*
  Example:
    {
      "appClip" : false,
      "builtByDeveloper" : false,
      "bundleIdentifier" : "com.apple.mobilesafari",
      "bundleVersion" : "8617.1.17.10.9",
      "defaultApp" : true,
      "hidden" : false,
      "internalApp" : false,
      "name" : "Safari",
      "removable" : false,
      "url" : "file:///Applications/MobileSafari.app/",
      "version" : "17.2"
    }
*/

/**
 * @typedef {Object} ExecuteOptions
 * @property {boolean} [logStdout=false]
 * @property {boolean} [asJson=true]
 * @property {boolean} [asynchronous=false]
 * @property {string[]|string} [subcommandOptions]
 * @property {number} [timeout]
 */

/**
 * @typedef {{asynchronous: true}} TAsyncOpts
 */

/**
 * @typedef {Object} ListFilesOptions
 * @property {string} [username] The username of the user we should target. Only relevant for certain domains.
 * @property {string} [subdirectory] A subdirectory within the domain. If not specified, defaults to the root.
 */

/**
 * @typedef {Object} PullFileOptions
 * @property {string} [username] The username of the user we should target. Only relevant for certain domains.
 * @property {string} domainType The file service domain. Valid values are: temporary, rootStaging, appDataContainer, appGroupDataContainer,
 * systemCrashLogs. You must specify a valid domain and identifier pair. Each domain is accompanied by an identifier
 * that provides additional context. For example, if the domain is an app data container, the identifier is the bundle
 * ID of the app. For temporary directories and root staging areas, the identifier is a unique client-provided string
 * which is used to get your own space, separate from those of other clients.
 * @property {string} domainIdentifier A unique string used to provide additional context to the domain.
 * @property {number} [timeout=120000] The timeout for pulling a file in milliseconds.
 */


/**
 * An option for launchApp method by devicectl.
 * @typedef {Object} LaunchAppOptions
 * @property {import('@appium/types').StringRecord<string|number>} [env] Bundle id to Environment variables for the launching app process.
 * @property {boolean} [terminateExisting=false] Whether terminating the already running app.
 */

export class Devicectl {
  /**
   * @since Xcode 15, iOS 17
   * @param {string} udid
   * @param {import('@appium/types').AppiumLogger} log
   */
  constructor(udid, log) {
    this.udid = udid;
    this.log = log;
  }

  /**
   * @template {ExecuteOptions} TExecOpts
   * @param {string[]} subcommand
   * @param {TExecOpts} [opts]
   * @return {Promise<TExecOpts extends TAsyncOpts ? import('teen_process').SubProcess : import('teen_process').TeenProcessExecResult>}
   */
  async execute(subcommand, opts) {
    const {
      logStdout = false,
      asynchronous = false,
      asJson = true,
      subcommandOptions,
      timeout,
    } = opts ?? {};

    const finalArgs = [
      'devicectl', ...subcommand,
      '--device', this.udid,
    ];
    if (subcommandOptions && !_.isEmpty(subcommandOptions)) {
      finalArgs.push(
        ...(Array.isArray(subcommandOptions) ? subcommandOptions : [subcommandOptions])
      );
    }
    if (asJson) {
      finalArgs.push('--quiet', '--json-output', '-');
    }
    const cmdStr = util.quote([XCRUN, ...finalArgs]);
    this.log.debug(`Executing ${cmdStr}`);
    try {
      if (asynchronous) {
        const result = new SubProcess(XCRUN, finalArgs);
        await result.start(0);
        // @ts-ignore TS does not understand it
        return result;
      }
      const result = await exec(
        XCRUN,
        finalArgs,
        ...(_.isNumber(timeout) ? [{timeout}] : []),
      );
      if (logStdout) {
        this.log.debug(`Command output: ${result.stdout}`);
      }
      // @ts-ignore TS does not understand it
      return result;
    } catch (e) {
      throw new Error(`'${cmdStr}' failed. Original error: ${e.stderr || e.stdout || e.message}`);
    }
  }

  /**
   * Simulates memory warning for the process with the given PID
   *
   * @param {number|string} pid The process identifier to simulate the Low Memory warning for
   * @return {Promise<void>}
   */
  async sendMemoryWarning(pid) {
    await this.execute(['device', 'process', 'sendMemoryWarning'], {
      subcommandOptions: ['--pid', `${pid}`]
    });
  }

  /**
   * Lists running processes on the device
   *
   * @returns {Promise<ProcessInfo[]>}
   */
  async listProcesses() {
    const {stdout} = await this.execute(['device', 'info', 'processes']);
    return JSON.parse(stdout).result.runningProcesses;
  }

  /**
   * Lists files at a specified path on the device
   *
   * @param {string} domainType The file service domain. Valid values are: temporary, rootStaging, appDataContainer, appGroupDataContainer,
   * systemCrashLogs. You must specify a valid domain and identifier pair. Each domain is accompanied by an identifier
   * that provides additional context. For example, if the domain is an app data container, the identifier is the bundle
   * ID of the app. For temporary directories and root staging areas, the identifier is a unique client-provided string
   * which is used to get your own space, separate from those of other clients.
   * @param {string} domainIdentifier A unique string used to provide additional context to the domain.
   * @param {ListFilesOptions} [opts={}]
   * @returns {Promise<string[]>} List of file names (could be empty)
   */
  async listFiles(domainType, domainIdentifier, opts = {}) {
    const subcommandOptions = [
      '--domain-type', domainType,
      '--domain-identifier', domainIdentifier,
    ];
    if (opts.username) {
      subcommandOptions.push('--username', opts.username);
    }
    if (opts.subdirectory) {
      subcommandOptions.push('--subdirectory', opts.subdirectory);
    }
    const {stdout} = await this.execute(['device', 'info', 'files'], {
      subcommandOptions,
    });
    return JSON.parse(stdout).result.files.map(({name}) => name);
  }

  /**
   * Pulls a file from the specified path on the device to a local file system
   *
   * @param {string} from The item which should be copied.
   * @param {string} to The location to which the item should be copied.
   * @param {PullFileOptions} opts
   * @returns {Promise<string>} The destination path (same as `to`)
   */
  async pullFile(from, to, opts) {
    const subcommandOptions = [
      '--domain-type', opts.domainType,
      '--domain-identifier', opts.domainIdentifier,
      '--source', from,
      '--destination', to,
    ];
    if (opts.username) {
      subcommandOptions.push('--user', opts.username);
    }
    await this.execute(['device', 'copy', 'from'], {
      subcommandOptions,
      timeout: opts.timeout ?? 120000,
      asJson: false,
    });
    return to;
  }

  /**
   * Send POSIX signal to the running process
   *
   * @param {number|string} pid The process identifier to send a signal to
   * @param {number|string} signal The signal to send to a process. See 'man signal' for a list of signals
   * @returns {Promise<void>}
   */
  async sendSignalToProcess(pid, signal) {
    await this.execute(['device', 'process', 'signal'], {
      subcommandOptions: ['--signal', `${signal}`, '--pid', `${pid}`]
    });
  }

  /**
   * Retrieves the list of installed apps from the device
   *
   * @param {string?} [bundleId=null] Provide the target bundle identifier
   * to speed up the lookup.
   * @returns {Promise<AppInfo[]>} Empty array is returned if no matching apps are found
   */
  async listApps(bundleId = null) {
    const subcommandOptions = ['--include-all-apps'];
    if (bundleId) {
      subcommandOptions.push('--bundle-id', bundleId);
    }
    const {stdout} = await this.execute(['device', 'info', 'apps'], {
      subcommandOptions,
    });
    return JSON.parse(stdout).result.apps;
  }

  /**
   * Launch the given bundle id application with the given environment variable.
   * This method is over devicectl command, this it may take additional seconds to launch the app.
   * Please use via WDA or via appium-ios-device as primary method to launch app if possible.
   *
   * @param {string} bundleId Bundle id to launch.
   * @param {LaunchAppOptions} opts launching app with devicectl command options.
   * @returns {Promise<void>}
   * @throws {Error} If the launching app command fails. For example, the given bundle id did not exist.
   */
  async launchApp(bundleId, opts) {
    const {
      env,
      terminateExisting = false
    } = opts;

    const subcommandOptions = [];
    if (terminateExisting) {
      subcommandOptions.push('--terminate-existing');
    };
    if (!_.isEmpty(env)) {
      subcommandOptions.push('--environment-variables', JSON.stringify(_.mapValues(env, (v) => _.toString(v))));
    };
    // The bundle id should be the last to apply arguments properly.
    // devicectl command might not raise exception while the order is wrong.
    subcommandOptions.push(bundleId);

    await this.execute(['device', 'process', 'launch'], { subcommandOptions, asJson: false});
  }
}
