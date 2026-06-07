import {errors} from 'appium/driver';
import {log} from '../logger';
import {memoize} from '../utils';
import {CLASS_CHAIN_EMITTER_KEY, WDA_CLASS_CHAIN_STRATEGY} from './constants';
import {ATTRIBUTE_SCHEMA} from './schema';
import {ClassChainEmitter} from './class-chain-emitter';
import type {CssTransformer, NativeLocator, StrategyKey} from '@appium/css-locator-to-native';

export {WDA_CLASS_CHAIN_STRATEGY} from './constants';

const emitters = {
  [CLASS_CHAIN_EMITTER_KEY]: new ClassChainEmitter(WDA_CLASS_CHAIN_STRATEGY),
};

const getTransformCss = memoize(async function loadTransformCss(): Promise<CssTransformer> {
  const mod = await import('@appium/css-locator-to-native');
  return mod.createCssTransformer({
    schema: ATTRIBUTE_SCHEMA,
    emitters,
    resolveStrategy(): StrategyKey<typeof emitters> {
      return CLASS_CHAIN_EMITTER_KEY;
    },
  });
});

/**
 * Converts a CSS selector string into a native locator for the resolved strategy.
 *
 * @param css - CSS selector to transform
 * @returns Native locator strategy name and selector string
 */
export async function cssToNativeLocator(css: string): Promise<NativeLocator> {
  try {
    const transformCss = await getTransformCss();
    return transformCss(css);
  } catch (err) {
    mapCssError(err, css);
  }
}

function mapCssError(err: unknown, css: string): never {
  if (isPackageError(err, 'InvalidSelectorError')) {
    log.debug(err.stack);
    throw new errors.InvalidSelectorError(
      `Invalid CSS selector '${css}'. Reason: '${err.message}'`,
    );
  }
  if (isPackageError(err, 'UnsupportedSelectorError')) {
    log.debug(err.stack);
    throw new errors.InvalidSelectorError(
      `Unsupported CSS selector '${css}'. Reason: '${err.message}'`,
    );
  }
  throw err;
}

function isPackageError(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}
