import B from 'bluebird';
import _ from 'lodash';
import {errors} from 'appium/driver';
import type {AppiumLogger, StringRecord} from '@appium/types';
import type {XCUITestDriver} from '../driver';
import type {XCTestResult, RunXCTestResult} from '../commands/types';
import {
  runXCTestViaRemoteXPC,
  listXCTestBundlesViaRemoteXPC,
  installXCTestBundleViaRemoteXPC,
} from './xctest-remotexpc';
import {isIos18OrNewerPlatform} from '../utils';

export class XCTestClient {
  private constructor(private readonly deps: XCTestClientDeps) {}

  static create(deps: XCTestClientDeps): XCTestClient {
    return new XCTestClient(deps);
  }

  static fromDriver(driver: XCUITestDriver): XCTestClient {
    return new XCTestClient({
      udid: driver.device.udid,
      isRealDevice: driver.isRealDevice(),
      platformVersion: driver.opts.platformVersion,
      launchWithIDB: !!driver.opts.launchWithIDB,
      log: driver.log,
      legacyRunner: (driver.device as any)?.idb,
    });
  }

  async run(
    testRunnerBundleId: string,
    appUnderTestBundleId: string,
    xcTestBundleId: string,
    args: string[] = [],
    testType: 'app' | 'ui' | 'logic' = 'ui',
    env?: StringRecord,
    timeout = 360000,
  ): Promise<RunXCTestResult> {
    if (this.shouldUseRemoteXPC && testType !== 'logic') {
      try {
        return await runXCTestViaRemoteXPC(
          this.deps.udid,
          testRunnerBundleId,
          appUnderTestBundleId,
          xcTestBundleId,
          testType,
          args,
          env,
          timeout,
        );
      } catch (err: any) {
        if (err instanceof errors.TimeoutError) {
          throw err;
        }
        this.deps.log.warn(
          `Failed to run XCTest via RemoteXPC, falling back to IDB: ${err.message}`,
        );
      }
    }

    const legacyRunner = this.requireLegacyRunner();
    const subproc = await legacyRunner.runXCUITest(
      testRunnerBundleId,
      appUnderTestBundleId,
      xcTestBundleId,
      {env, args, testType},
    );

    return await new B((resolve, reject) => {
      let mostRecentLogObject: XCTestResult[] | string[] | null = null;
      let xctestTimeout: NodeJS.Timeout | undefined;
      let lastErrorMessage: string | null = null;

      if (timeout > 0) {
        xctestTimeout = setTimeout(
          () =>
            reject(
              new errors.TimeoutError(
                `Timed out after '${timeout}ms' waiting for XCTest to complete`,
              ),
            ),
          timeout,
        );
      }

      subproc.on('output', (stdout: string, stderr: string) => {
        if (stdout) {
          try {
            mostRecentLogObject = parseLegacyXCTestStdout(stdout);
          } catch (err: any) {
            this.deps.log.warn(`Failed to parse logs from test output: '${stdout}'`);
            this.deps.log.debug(err.stack);
          }
        }

        if (stderr) {
          lastErrorMessage = stderr;
          this.deps.log.error(stderr);
        }
        if (stdout) {
          this.deps.log.info(stdout);
        }
      });

      subproc.on('exit', (code: number | null, signal: string | null) => {
        if (xctestTimeout) {
          clearTimeout(xctestTimeout);
        }
        if (code !== 0) {
          const err = new Error(lastErrorMessage || String(mostRecentLogObject)) as Error & {
            code: number;
            signal?: string;
            result?: XCTestResult[];
          };
          err.code = code ?? -1;
          if (signal != null) {
            err.signal = signal;
          }
          if (mostRecentLogObject) {
            err.result = mostRecentLogObject as XCTestResult[];
          }
          return reject(err);
        }
        resolve({
          code: code ?? 0,
          signal: signal ?? null,
          results: mostRecentLogObject as XCTestResult[],
          passed: true,
        });
      });
    });
  }

  async installBundle(xctestApp: string): Promise<void> {
    if (this.shouldUseRemoteXPC) {
      try {
        await installXCTestBundleViaRemoteXPC(this.deps.udid, xctestApp);
        return;
      } catch (err: any) {
        this.deps.log.warn(
          `Failed to install XCTest bundle via RemoteXPC, falling back to IDB: ${err.message}`,
        );
      }
    }

    await this.requireLegacyRunner().installXCTestBundle(xctestApp);
  }

  async listBundles(): Promise<string[]> {
    if (this.shouldUseRemoteXPC) {
      try {
        return await listXCTestBundlesViaRemoteXPC(this.deps.udid);
      } catch (err: any) {
        this.deps.log.warn(
          `Failed to list XCTest bundles via RemoteXPC, falling back to IDB: ${err.message}`,
        );
      }
    }

    return await this.requireLegacyRunner().listXCTestBundles();
  }

  async listTestsInBundle(bundle: string): Promise<string[]> {
    return await this.requireLegacyRunner().listXCTestsInTestBundle(bundle);
  }

  private requireLegacyRunner(): LegacyXCTestRunner {
    if (!this.deps.legacyRunner || !this.deps.launchWithIDB) {
      throw new Error(
        `To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
          `and sessions must be run with the "launchWithIDB" capability`,
      );
    }
    return this.deps.legacyRunner;
  }

  private get shouldUseRemoteXPC(): boolean {
    return this.deps.isRealDevice && isIos18OrNewerPlatform(this.deps.platformVersion);
  }
}

export function parseLegacyXCTestStdout(stdout: string): XCTestResult[] | string[] {
  function parseKey(name: string): string {
    const words = name.split(' ');
    let out = '';
    for (const word of words) {
      out += word.substr(0, 1).toUpperCase() + word.substr(1);
    }
    return out.substr(0, 1).toLowerCase() + out.substr(1);
  }

  function parseValue(value: string): any {
    value = value || '';
    switch (value.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      case '':
        return null;
      default:
        break;
    }
    if (!isNaN(Number(value))) {
      if (!_.isString(value)) {
        return 0;
      } else if (value.indexOf('.') > 0) {
        return parseFloat(value);
      }
      return parseInt(value, 10);
    }
    return value;
  }

  if (!stdout) {
    return [];
  }

  const lines = stdout.trim().split('\n');
  if (lines.length === 1 && !lines[0].includes('|')) {
    return [lines[0]];
  }

  const results: XCTestResult[] = [];
  for (const line of lines) {
    const properties = line.split('|');
    const output: any = {};
    let entryIndex = 0;

    for (const prop of properties) {
      if (entryIndex === 0) {
        output.testName = prop.trim();
      } else if (prop.trim().startsWith('Location')) {
        output.location = prop.substring(prop.indexOf('Location') + 8).trim();
      } else {
        const [key, value] = prop.split(':');
        output[parseKey(key.trim())] = parseValue(value ? value.trim() : '');
      }
      entryIndex++;
    }

    if (!output.passed) {
      output.passed = output.status === 'passed';
      output.crashed = output.status === 'crashed';
    } else if (!output.status) {
      if (output.passed) {
        output.status = 'passed';
      } else if (output.crashed) {
        output.status = 'crashed';
      } else {
        output.status = 'failed';
      }
    }

    results.push(output);
  }
  return results;
}

interface XCTestClientDeps {
  udid: string;
  isRealDevice: boolean;
  platformVersion?: string | null;
  launchWithIDB: boolean;
  log: AppiumLogger;
  legacyRunner?: LegacyXCTestRunner;
}

interface LegacyXCTestRunner {
  runXCUITest(
    testRunnerBundleId: string,
    appUnderTestBundleId: string,
    xcTestBundleId: string,
    options: {
      env?: StringRecord;
      args?: string[];
      testType: 'app' | 'ui' | 'logic';
    },
  ): Promise<NodeJS.EventEmitter>;
  installXCTestBundle(xctestAppPath: string): Promise<void>;
  listXCTestBundles(): Promise<string[]>;
  listXCTestsInTestBundle(bundle: string): Promise<string[]>;
}
