import type {XCUITestDriver} from '../driver';

export type AlertAction = 'accept' | 'dismiss' | 'getButtons';

/**
 * Gets the text of the currently displayed alert.
 *
 * @returns The alert text, or null if no alert is displayed
 */
export async function getAlertText(this: XCUITestDriver): Promise<string | null> {
  return await this.proxyCommand<any, string | null>('/alert/text', 'GET');
}

/**
 * Sets the text in an alert input field.
 *
 * @param value - The text to set
 */
export async function setAlertText(this: XCUITestDriver, value: string): Promise<void> {
  await this.proxyCommand('/alert/text', 'POST', {value});
}

/**
 * Accepts the currently displayed alert.
 *
 * @param opts - Options including optional button label
 */
export async function postAcceptAlert(
  this: XCUITestDriver,
  opts: AlertOptions = {},
): Promise<void> {
  await this.proxyCommand('/alert/accept', 'POST', toAlertParams(opts));
}

/**
 * Dismisses the currently displayed alert.
 *
 * @param opts - Options including optional button label
 */
export async function postDismissAlert(
  this: XCUITestDriver,
  opts: AlertOptions = {},
): Promise<void> {
  await this.proxyCommand('/alert/dismiss', 'POST', toAlertParams(opts));
}

/**
 * Gets the list of button labels from the currently displayed alert.
 *
 * @returns The list of button labels
 * @internal
 */
export async function getAlertButtons(this: XCUITestDriver): Promise<string[]> {
  return await this.proxyCommand<any, string[]>('/wda/alert/buttons', 'GET');
}

/**
 * Tries to apply the given action to the currently visible alert.
 *
 * @param action - The actual action to apply
 * @param buttonLabel - The name of the button used to perform the chosen alert action. Only makes sense if the action is `accept` or `dismiss`
 * @returns If `action` is `getButtons`, a list of alert button labels; otherwise nothing
 * @remarks This should really be separate commands.
 */
export async function mobileHandleAlert(
  this: XCUITestDriver,
  action: AlertAction,
  buttonLabel?: string,
): Promise<string[] | void> {
  switch (action) {
    case 'accept':
      return await this.postAcceptAlert({buttonLabel});
    case 'dismiss':
      return await this.postDismissAlert({buttonLabel});
    case 'getButtons':
      return await this.getAlertButtons();
    default:
      throw new Error(
        `The 'action' value should be either 'accept', 'dismiss' or 'getButtons'. ` +
          `'${action}' is provided instead.`,
      );
  }
}

function toAlertParams(opts: AlertOptions = {}): {name?: string} {
  const params: {name?: string} = {};
  if (opts.buttonLabel) {
    params.name = opts.buttonLabel;
  }
  return params;
}

interface AlertOptions {
  buttonLabel?: string;
}
