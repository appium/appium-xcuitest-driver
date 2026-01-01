import _ from 'lodash';
import {XCUITestDriver} from '../driver';
import {errors, errorFromCode, errorFromW3CJsonCode} from 'appium/driver';
import {util} from 'appium/support';
import type {Element, StringRecord} from '@appium/types';

/**
 * Collect the response of an async script execution
 * @deprecated
 * @privateRemarks It's unclear what this is for. Don't use it.
 */
export async function receiveAsyncResponse(
  this: XCUITestDriver,
  status: number | null | undefined,
  value: any,
): Promise<void> {
  this.log.debug(`Received async response: ${JSON.stringify(value)}`);
  if (!util.hasValue(this.asyncPromise)) {
    this.log.warn(
      `Received async response when we were not expecting one! ` +
        `Response was: ${JSON.stringify(value)}`,
    );
    return;
  }

  if (util.hasValue(status) && status !== 0) {
    // MJSONWP
    return this.asyncPromise.reject(errorFromCode(status, value.message));
  }
  if (!util.hasValue(status) && value && _.isString(value.error)) {
    // W3C
    return this.asyncPromise.reject(
      errorFromW3CJsonCode(value.error, value.message, value.stacktrace),
    );
  }
  return this.asyncPromise.resolve(value);
}

/**
 * @template TReturn
 * @param script - Either a script to run, or in the case of an Execute Method, the name of the script to execute.
 * @param args
 */
export async function execute<TReturn = unknown>(
  this: XCUITestDriver,
  script: string,
  args?: ExecuteMethodArgs,
): Promise<TReturn> {
  // TODO: create a type that converts args to the parameters of the associated method using the `command` prop of `executeMethodMap`
  script = script.trim().replace(/^mobile:\s*/, 'mobile: ');
  if (isExecuteMethod(script)) {
    const executeMethodArgs = preprocessExecuteMethodArgs(script, args as ExecuteMethodArgs | undefined);
    return await this.executeMethod(script, [executeMethodArgs]);
  } else if (this.isWebContext()) {
    const atomsArgs = this.convertElementsForAtoms(args as readonly any[] | undefined);
    const result = await this.executeAtom('execute_script', [script, atomsArgs]);
    return this.cacheWebElements(result);
  } else {
    throw new errors.NotImplementedError();
  }
}

/**
 * @group Mobile Web Only
 */
export async function executeAsync(
  this: XCUITestDriver,
  script: string,
  args?: readonly any[],
): Promise<any> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  args = this.convertElementsForAtoms(args);
  this.asyncWaitMs = this.asyncWaitMs || 0;
  const promise = this.remote.executeAtomAsync(
    'execute_async_script',
    [script, args, this.asyncWaitMs],
    this.curWebFrames,
  );
  return this.cacheWebElements(await this.waitForAtom(promise));
}


/**
 * Checks if script expects a particular parameter (either optional or required).
 * @template Script
 * @param script - Script name
 * @param param - Parameter name
 * @returns {boolean}
 */
function executeMethodExpectsParam<Script extends keyof typeof XCUITestDriver.executeMethodMap>(
  script: Script,
  param: string,
): boolean {
  let required: ReadonlyArray<string> | undefined;
  let optional: ReadonlyArray<string> | undefined;
  const execMethodDef = XCUITestDriver.executeMethodMap[script];
  if ('params' in execMethodDef) {
    if ('required' in execMethodDef.params) {
      required = execMethodDef.params.required;
    }
    if ('optional' in execMethodDef.params) {
      optional = execMethodDef.params.optional;
    }
  }
  const allParams = new Set(_.flatten([...(required ?? []), ...(optional ?? [])]));
  return allParams.has(param);
}

/**
 * @param script
 * @returns {script is keyof XCUITestDriver.executeMethodMap}
 */
function isExecuteMethod(script: string): script is keyof typeof XCUITestDriver.executeMethodMap {
  return script in XCUITestDriver.executeMethodMap;
}

/**
 * Massages the arguments going into an execute method.
 * @param script
 * @param args
 */
function preprocessExecuteMethodArgs(
  script: keyof typeof XCUITestDriver.executeMethodMap,
  args?: ExecuteMethodArgs,
): StringRecord<unknown> {
  if (_.isArray(args)) {
    args = _.first(args);
  }
  const executeMethodArgs = (args ?? {}) as StringRecord<unknown>;
  /**
   * Renames the deprecated `element` key to `elementId`.  Historically,
   * all of the pre-Execute-Method-Map execute methods accepted an `element` _or_ and `elementId` param.
   * This assigns the `element` value to `elementId` if `elementId` is not already present.
   */
  if (!('elementId' in executeMethodArgs) && 'element' in executeMethodArgs) {
    executeMethodArgs.elementId = executeMethodArgs.element;
    delete executeMethodArgs.element;
  }

  /**
   * Automatically unwraps the `elementId` prop _if and only if_ the execute method expects it.
   *
   * Most of these Execute Methods (typically beginning with `mobile*`) will accept an `Element|string` for `elementId`, in practice they will only ever get a `string`. `Element|string` in the method's docstring is simply for documentation purposes.
   */
  if ('elementId' in executeMethodArgs && executeMethodExpectsParam(script, 'elementId')) {
    executeMethodArgs.elementId = util.unwrapElement(
      executeMethodArgs.elementId as Element<string> | string,
    );
  }

  return executeMethodArgs;
}

type ExecuteMethodArgs = readonly any[] | readonly [StringRecord<unknown>] | Readonly<StringRecord<unknown>>;
