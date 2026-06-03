import fs from 'node:fs/promises';

const IPC_UNAVAILABLE_PATTERN = /Driver-instance IPC is unavailable/i;
const SESSION_OVERRIDE_CLEANUP_PATTERN = /Cleaning up \d+ active sessions?/i;
const IPC_CLAIM_WARNING_PATTERN = /Terminating the obsolete session/i;
const IPC_CLAIMED_TOPIC_PATTERN = /xcuitest:sessionUdidClaimed/i;

export async function readAppiumLog(): Promise<string | undefined> {
  const logPath = process.env.APPIUM_LOG_PATH;
  if (!logPath) {
    return undefined;
  }
  return await fs.readFile(logPath, 'utf8');
}

export function assertSessionClaimIpcTraces(log: string): void {
  if (IPC_UNAVAILABLE_PATTERN.test(log)) {
    throw new Error(
      'Appium server log shows driver-instance IPC is unavailable. ' +
        'Use Appium 3.5.0 or newer (npx appium from this project) so AppiumIpc is exported.',
    );
  }

  if (SESSION_OVERRIDE_CLEANUP_PATTERN.test(log)) {
    throw new Error(
      'Appium server log shows session-override cleanup. ' +
        'Do not start the test server with --session-override; it terminates existing sessions ' +
        'before the XCUITest driver IPC claim handler can run.',
    );
  }

  if (!IPC_CLAIM_WARNING_PATTERN.test(log)) {
    throw new Error(
      'Appium server log is missing the session claim warning ' +
        '("Terminating the obsolete session"). The IPC handler did not terminate the first session.',
    );
  }

  if (!IPC_CLAIMED_TOPIC_PATTERN.test(log)) {
    throw new Error(
      'Appium server log is missing xcuitest:sessionUdidClaimed IPC activity. ' +
        'The session claim pub/sub flow did not run.',
    );
  }
}
