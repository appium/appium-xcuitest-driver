import {errors} from 'appium/driver';
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
    throw mapCssError(err, css);
  }
}

function mapCssError(err: unknown, css: string): Error {
  if (isPackageError(err, 'InvalidSelectorError')) {
    return new errors.InvalidSelectorError(`Invalid CSS selector '${css}'`, err);
  }
  if (isPackageError(err, 'UnsupportedSelectorError')) {
    return new errors.InvalidSelectorError(`Unsupported CSS selector '${css}'`, err);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}

function isPackageError(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}
