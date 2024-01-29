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
 */

/**
 * @typedef {{asynchronous: true}} TAsyncOpts
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
      const result = await exec(XCRUN, finalArgs);
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
}
