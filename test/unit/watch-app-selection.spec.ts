import assert from 'node:assert/strict';
import {cp} from 'node:fs/promises';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import type {CachedAppInfo, PostProcessOptions, StringRecord} from '@appium/types';
import {fs, plist, tempDir, zip} from 'appium/support.js';
import {createSandbox, type SinonSpy, type SinonSandbox} from 'sinon';

import {AppInfosCache} from '../../lib/app-infos-cache.js';
import {onPostConfigureApp, type WatchAppSelectionScope} from '../../lib/commands/helpers/app.js';
import {PLATFORM_NAME_IOS, PLATFORM_NAME_WATCHOS} from '../../lib/constants.js';
import {XCUITestDriver, type XCUITestDriverOpts} from '../../lib/driver.js';
import {log} from '../../lib/logger.js';

const IOS_SIMULATOR_PLATFORM = 'iPhoneSimulator';
const WATCH_SIMULATOR_PLATFORM = 'WatchSimulator';

/** The `platformName` capability as derived from the driver constraints. */
type PlatformName = NonNullable<XCUITestDriverOpts['platformName']>;

type DriverStub = {
  driver: XCUITestDriver;
  warn: SinonSpy;
  sandbox: SinonSandbox;
};

/** Application paths handed out by `resolveAppPath`, which the driver owns. */
let selectedAppPaths: string[] = [];

afterEach(async function () {
  for (const appPath of selectedAppPaths) {
    await fs.rimraf(path.dirname(appPath));
  }
  selectedAppPaths = [];
});

/**
 * Creates a driver whose session looks like a Simulator one for the given platform.
 */
function makeDriver(platformName: PlatformName, extraOpts: Partial<XCUITestDriverOpts> = {}): DriverStub {
  const sandbox = createSandbox();
  const driver = new XCUITestDriver({} as XCUITestDriverOpts);
  driver.opts.platformName = platformName;
  Object.assign(driver.opts, extraOpts);
  sandbox.stub(driver, 'isSimulator').returns(true);
  sandbox.stub(driver, 'isRealDevice').returns(false);
  return {driver, warn: sandbox.spy(driver.log, 'warn'), sandbox};
}

/**
 * Writes an application bundle with the given manifest to `<basePath>/<bundleName>`.
 *
 * @returns The full path to the created bundle
 */
async function writeAppBundle(basePath: string, bundleName: string, manifest: StringRecord): Promise<string> {
  const bundlePath = path.join(basePath, bundleName);
  await fs.mkdirp(bundlePath);
  await fs.writeFile(path.join(bundlePath, 'Info.plist'), plist.createPlist(manifest), 'utf8');
  return bundlePath;
}

/**
 * Invokes the `configureApp` post-processing callback the way the base driver does.
 *
 * @param scope What role the package plays in the session
 * @returns The application path the session must use, or `null` if the original one is kept
 */
async function resolveAppPath(
  driver: XCUITestDriver,
  appPath: string,
  scope: WatchAppSelectionScope = 'app-under-test',
): Promise<string | null> {
  const opts: PostProcessOptions = {appPath, isUrl: false, originalAppLink: appPath};
  const result = await onPostConfigureApp.call(driver, scope, opts);
  // No result means "keep the app as is"; only a rewritten one carries a new path.
  const appPath_ = result?.appPath;
  if (appPath_ && appPath_ !== appPath) {
    selectedAppPaths.push(appPath_);
  }
  return appPath_ ?? null;
}

/**
 * Invokes the post-processing callback for a package the base driver has a cache entry for.
 *
 * @param cachedPath Full path of the previously extracted application, holding its own Info.plist
 * @returns The application path the session must use, or `null` if the original one is kept
 */
async function resolveCachedAppPath(
  driver: XCUITestDriver,
  archivePath: string,
  cachedPath: string,
): Promise<string | null> {
  const cachedAppInfo: CachedAppInfo = {
    packageHash: await fs.hash(archivePath),
    integrity: {folder: (await fs.glob('**/*', {cwd: cachedPath})).length},
    fullPath: cachedPath,
    timestamp: Date.now(),
  };
  const opts: PostProcessOptions = {appPath: archivePath, isUrl: false, originalAppLink: archivePath, cachedAppInfo};
  const result = await onPostConfigureApp.call(driver, 'app-under-test', opts);
  const appPath = result?.appPath;
  if (appPath && appPath !== archivePath) {
    selectedAppPaths.push(appPath);
  }
  return appPath ?? null;
}

/** Temporary folders holding simulated cache entries, removed after each test. */
const cacheDirs: string[] = [];

afterEach(async function () {
  for (const cacheDir of cacheDirs) {
    await fs.rimraf(cacheDir);
  }
  cacheDirs.length = 0;
});

/**
 * Copies an application bundle to a folder of its own, the way the base driver keeps the
 * application it extracted from a package at a path that has nothing to do with that package.
 *
 * @returns Full path to the copy
 */
async function copyBundleToCache(bundlePath: string): Promise<string> {
  const cacheDir = await tempDir.openDir();
  cacheDirs.push(cacheDir);
  const cachedPath = path.join(cacheDir, path.basename(bundlePath));
  await cp(bundlePath, cachedPath, {recursive: true});
  return cachedPath;
}
/**
 * @returns The error thrown by the given promise, or `null` if it resolves
 */
async function expectRejection(promise: Promise<unknown>): Promise<Error | null> {
  return await promise.then(
    () => null,
    (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  );
}

describe('watch app selection', function () {
  describe('configureApp post processing', function () {
    it('should pick a single nested watch app for a watchOS session', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
          WKWatch1To1CompanionKey: {BundleIdentifier: 'com.acme.foo.watchapp'},
        });
        const nestedAppPath = await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          WKCompanionAppBundleIdentifier: 'com.acme.foo',
        });

        const resultAppPath = await resolveAppPath(driver, outerAppPath);
        assert.strictEqual(path.basename(String(resultAppPath)), 'Bar.app');
        assert.strictEqual(await fs.exists(path.join(String(resultAppPath), 'Info.plist')), true);
        // the selected bundle is a disposable copy, the user's package stays intact
        assert.notStrictEqual(resultAppPath, nestedAppPath);
        assert.strictEqual(await fs.exists(nestedAppPath), true);
        assert.match(warn.firstCall.args.join(' '), /com\.acme\.foo/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should list all discovered bundles if several are nested and none is selected', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const err = await expectRejection(resolveAppPath(driver, outerAppPath));
        assert.ok(err, 'expected the selection to fail');
        assert.match(err.message, /appium:watchBundleId/);
        assert.match(err.message, /'com\.acme\.foo\.one' \(Foo\.app\/Watch\/One\.app\)/);
        assert.match(err.message, /'com\.acme\.foo\.two' \(Foo\.app\/Watch\/Two\.app\)/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // The paths printed by the ambiguity error are what a user copies back into
    // `appium:watchBundleId`, so the two must agree by construction, not by coincidence.
    it('should accept every path form it prints in the ambiguity error', async function () {
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const listingDriver = makeDriver(PLATFORM_NAME_WATCHOS);
        let listingError: Error | null = null;
        try {
          listingError = await expectRejection(resolveAppPath(listingDriver.driver, outerAppPath));
        } finally {
          listingDriver.sandbox.restore();
        }
        assert.ok(listingError, 'expected the selection to fail');
        const printedPaths = [...listingError.message.matchAll(/\(([^)]+\.app)\)/g)].map((match) => match[1]);
        assert.deepEqual(printedPaths.slice().sort(), ['Foo.app/Watch/One.app', 'Foo.app/Watch/Two.app']);

        for (const printedPath of printedPaths) {
          const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: printedPath});
          try {
            const resultAppPath = await resolveAppPath(driver, outerAppPath);
            assert.strictEqual(
              path.basename(String(resultAppPath)),
              path.posix.basename(printedPath),
              `the driver rejected a path it had just printed: '${printedPath}'`,
            );
          } finally {
            sandbox.restore();
          }
        }
      } finally {
        await fs.rimraf(tmpDir);
      }
    });

    it('should pick the bundle named by watchBundleId', async function () {
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        for (const watchBundleId of ['com.acme.foo.two', 'Watch/Two.app', 'Two.app']) {
          const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId});
          try {
            const resultAppPath = await resolveAppPath(driver, outerAppPath);
            assert.strictEqual(
              path.basename(String(resultAppPath)),
              'Two.app',
              `unexpected selection for '${watchBundleId}'`,
            );
          } finally {
            sandbox.restore();
          }
        }
      } finally {
        await fs.rimraf(tmpDir);
      }
    });

    it('should pick the bundle named by bundleId', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {bundleId: 'com.acme.foo.one'});
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const resultAppPath = await resolveAppPath(driver, outerAppPath);
        assert.strictEqual(path.basename(String(resultAppPath)), 'One.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should use the watch app owned by the outer app to disambiguate', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
          WKWatch1To1CompanionKey: {BundleIdentifier: 'com.acme.foo.two'},
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const resultAppPath = await resolveAppPath(driver, outerAppPath);
        assert.strictEqual(path.basename(String(resultAppPath)), 'Two.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should fail if bundleId references another application', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {bundleId: 'com.acme.foo'});
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const err = await expectRejection(resolveAppPath(driver, outerAppPath));
        assert.ok(err, 'expected the selection to fail');
        assert.match(err.message, /does not reference the 'com\.acme\.foo\.one' watchOS application/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should fail if watchBundleId matches nothing', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'com.acme.foo.three'});
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const err = await expectRejection(resolveAppPath(driver, outerAppPath));
        assert.ok(err, 'expected the selection to fail');
        assert.match(err.message, /matches none of/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should keep a directly provided watch app unchanged', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const watchAppPath = await writeAppBundle(tmpDir, 'Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          WKCompanionAppBundleIdentifier: 'com.acme.foo',
        });

        assert.strictEqual(await resolveAppPath(driver, watchAppPath), null);
        assert.strictEqual(warn.callCount, 0);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should not warn if the selected watch app is standalone', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          '1KitProvisioningComponent': 'com.apple.reviewkit',
        });

        const resultAppPath = await resolveAppPath(driver, outerAppPath);
        assert.strictEqual(path.basename(String(resultAppPath)), 'Bar.app');
        assert.strictEqual(warn.callCount, 0);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should keep the behaviour of iOS sessions unchanged', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_IOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        assert.strictEqual(await resolveAppPath(driver, outerAppPath), null);
        assert.strictEqual(warn.callCount, 0);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should fail if the application under test carries no watch app', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await fs.mkdirp(path.join(outerAppPath, 'Watch'));

        const err = await expectRejection(resolveAppPath(driver, outerAppPath));
        assert.ok(err, 'expected the session to fail');
        assert.match(err.message, /'Foo\.app'.*contains no watchOS application bundle/s);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should keep an iOS-only companion package of a watchOS session unchanged', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'com.acme.watch'});
      const tmpDir = await tempDir.openDir();
      try {
        const companionAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await fs.mkdirp(path.join(companionAppPath, 'Watch'));

        assert.strictEqual(await resolveAppPath(driver, companionAppPath, 'other-application'), null);
        assert.strictEqual(warn.callCount, 0);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should not let the caps of the application under test select another package', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {
        watchBundleId: 'com.acme.watch',
        bundleId: 'com.acme.watch',
      });
      const tmpDir = await tempDir.openDir();
      try {
        const otherAppPath = await writeAppBundle(tmpDir, 'Bar.app', {
          CFBundleIdentifier: 'com.acme.bar',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        // Two watch bundles, so the package cannot be resolved on its own, and the session caps
        // name an application that has nothing to do with it.
        await writeAppBundle(otherAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.bar.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(otherAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.bar.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const err = await expectRejection(resolveAppPath(driver, otherAppPath, 'other-application'));
        assert.ok(err, 'expected the selection to fail');
        // 'appium:watchBundleId' names a bundle of another package: consulting it here would
        // report "matches none of" instead of the ambiguity this package really has.
        assert.doesNotMatch(err.message, /matches none of|does not reference/);
        assert.match(err.message, /Only one of them can be installed at a time/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should skip nested bundles not supporting the session platform', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const resultAppPath = await resolveAppPath(driver, outerAppPath);
        assert.strictEqual(path.basename(String(resultAppPath)), 'Two.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should pick a watch app from an archive containing Payload', async function () {
      const {driver, warn, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const outerAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          WKCompanionAppBundleIdentifier: 'com.acme.foo',
        });
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const resultAppPath = String(await resolveAppPath(driver, zipPath));
        assert.strictEqual(path.basename(resultAppPath), 'Bar.app');
        assert.strictEqual(await fs.exists(path.join(resultAppPath, 'Info.plist')), true);
        assert.match(warn.firstCall.args.join(' '), /com\.acme\.foo/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // The driver is installed on Linux and Windows hosts too, where no `ditto` exists. Copying the
    // selected bundle must not depend on that macOS tool.
    it('should copy the selected bundle on a host without ditto', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      // `fs.which` rejects when an executable is missing, which is how a Linux host reports it.
      sandbox.stub(fs, 'which').rejects(new Error('not found: ditto'));
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const resultAppPath = String(await resolveAppPath(driver, outerAppPath));
        assert.strictEqual(path.basename(resultAppPath), 'Bar.app');
        assert.strictEqual(await fs.exists(path.join(resultAppPath, 'Info.plist')), true);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // A copied bundle has to stay self-contained: `fs.cp` rewrites relative link targets into
    // absolute paths back into the source bundle unless `verbatimSymlinks` is set, which would make
    // the installed application depend on a temporary directory the driver later deletes.
    it('should keep bundle symlinks pointing inside the copied bundle', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      sandbox.stub(fs, 'which').rejects(new Error('not found: ditto'));
      const tmpDir = await tempDir.openDir();
      try {
        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        const nestedAppPath = await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const frameworkDir = path.join(nestedAppPath, 'Frameworks', 'Bar.framework');
        await fs.mkdirp(path.join(frameworkDir, 'Versions', 'A'));
        await fs.writeFile(path.join(frameworkDir, 'Versions', 'A', 'Bar'), 'binary', 'utf8');
        await fs.symlink('A', path.join(frameworkDir, 'Versions', 'Current'), 'dir');
        await fs.symlink('Versions/Current/Bar', path.join(frameworkDir, 'Bar'), 'file');

        const resultAppPath = String(await resolveAppPath(driver, outerAppPath));
        // Deleting the user's package must not break the copy the session installs.
        await fs.rimraf(tmpDir);

        const copiedLink = path.join(resultAppPath, 'Frameworks', 'Bar.framework', 'Versions', 'Current');
        assert.strictEqual(await fs.readlink(copiedLink), 'A');
        assert.strictEqual(
          String(await fs.readFile(path.join(resultAppPath, 'Frameworks', 'Bar.framework', 'Bar'), 'utf8')),
          'binary',
        );
      } finally {
        sandbox.restore();
      }
    });

    // The base driver keys its application cache on the path of the package, so two sessions
    // pointing at the same archive share one entry - whichever bundle the first of them unpacked.
    it('should not reuse a cached watch app another capability selected', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'com.acme.foo.two'});
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const outerAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        const cachedPath = await copyBundleToCache(
          await writeAppBundle(tmpDir, 'previous/One.app', {
            CFBundleIdentifier: 'com.acme.foo.one',
            CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          }),
        );
        await writeAppBundle(outerAppPath, 'Watch/One.app', {
          CFBundleIdentifier: 'com.acme.foo.one',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Two.app', {
          CFBundleIdentifier: 'com.acme.foo.two',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const resultAppPath = String(await resolveCachedAppPath(driver, zipPath, cachedPath));
        assert.strictEqual(path.basename(resultAppPath), 'Two.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should not install an iOS application cached by another session', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const outerAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        // An iOS session unpacked this same archive before, so the cache holds the outer bundle.
        const cachedPath = await copyBundleToCache(outerAppPath);
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const resultAppPath = String(await resolveCachedAppPath(driver, zipPath, cachedPath));
        assert.strictEqual(path.basename(resultAppPath), 'Bar.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // A cache entry a watchOS session selected has to survive into the next watchOS session that
    // asks for the same application; otherwise every session would unpack the archive again.
    it('should reuse a cached watch app this session selects', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'Bar.app'});
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const outerAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(outerAppPath, 'Watch/Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const cachedPath = await copyBundleToCache(path.join(outerAppPath, 'Watch', 'Bar.app'));
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        assert.strictEqual(await resolveCachedAppPath(driver, zipPath, cachedPath), cachedPath);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // Several iOS applications may share an archive; the one owning the requested watch
    // application is not necessarily the first the scan reaches.
    it('should keep scanning the archive for the owner of the requested watch app', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'com.acme.bar.watchapp'});
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const fooAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(fooAppPath, 'Watch/FooWatch.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const barAppPath = await writeAppBundle(stageDir, 'Payload/Bar.app', {
          CFBundleIdentifier: 'com.acme.bar',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(barAppPath, 'Watch/BarWatch.app', {
          CFBundleIdentifier: 'com.acme.bar.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const resultAppPath = String(await resolveAppPath(driver, zipPath));
        assert.strictEqual(path.basename(resultAppPath), 'BarWatch.app');
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    it('should name every watch app of the package when none matches', async function () {
      const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS, {watchBundleId: 'com.acme.missing'});
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        const fooAppPath = await writeAppBundle(stageDir, 'Payload/Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(fooAppPath, 'Watch/FooWatch.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const barAppPath = await writeAppBundle(stageDir, 'Payload/Bar.app', {
          CFBundleIdentifier: 'com.acme.bar',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
        });
        await writeAppBundle(barAppPath, 'Watch/BarWatch.app', {
          CFBundleIdentifier: 'com.acme.bar.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
        });
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const err = await expectRejection(resolveAppPath(driver, zipPath));
        assert.ok(err, 'expected the selection to fail');
        assert.match(err.message, /com\.acme\.foo\.watchapp/);
        assert.match(err.message, /com\.acme\.bar\.watchapp/);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
      }
    });

    // The same archive scanned twice has to yield the same application: the generic selection
    // takes the first compatible bundle, and the order a filesystem reports is not guaranteed.
    it('should pick the same watch app of an archive on repeated scans', async function () {
      const tmpDir = await tempDir.openDir();
      try {
        const stageDir = path.join(tmpDir, 'stage');
        for (const name of ['Zeta', 'Alpha']) {
          const appPath = await writeAppBundle(stageDir, `Payload/${name}.app`, {
            CFBundleIdentifier: `com.acme.${name.toLowerCase()}`,
            CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
          });
          await writeAppBundle(appPath, 'Watch/Watch.app', {
            CFBundleIdentifier: `com.acme.${name.toLowerCase()}.watchapp`,
            CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          });
        }
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: stageDir});

        const picked: string[] = [];
        for (let i = 0; i < 2; i = i + 1) {
          const {driver, sandbox} = makeDriver(PLATFORM_NAME_WATCHOS);
          try {
            picked.push(String(await resolveAppPath(driver, zipPath)));
          } finally {
            sandbox.restore();
          }
        }
        const cache = new AppInfosCache(log);
        assert.strictEqual(await cache.extractBundleId(picked[0]), 'com.acme.alpha.watchapp');
        assert.strictEqual(await cache.extractBundleId(picked[1]), 'com.acme.alpha.watchapp');
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });

  describe('AppInfosCache.extractWatchAppInfo', function () {
    it('should extract the watchOS packaging metadata', async function () {
      const cache = new AppInfosCache(log);
      const tmpDir = await tempDir.openDir();
      try {
        const watchAppPath = await writeAppBundle(tmpDir, 'Bar.app', {
          CFBundleIdentifier: 'com.acme.foo.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          WKCompanionAppBundleIdentifier: 'com.acme.foo',
        });
        assert.deepStrictEqual(await cache.extractWatchAppInfo(watchAppPath), {
          bundleId: 'com.acme.foo.watchapp',
          companionAppBundleId: 'com.acme.foo',
          companionWatchBundleId: undefined,
          isStandalone: false,
          platforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const standaloneAppPath = await writeAppBundle(tmpDir, 'Baz.app', {
          CFBundleIdentifier: 'com.acme.baz.watchapp',
          CFBundleSupportedPlatforms: [WATCH_SIMULATOR_PLATFORM],
          '1KitProvisioningComponent': 'com.apple.reviewkit',
        });
        assert.deepStrictEqual(await cache.extractWatchAppInfo(standaloneAppPath), {
          bundleId: 'com.acme.baz.watchapp',
          companionAppBundleId: undefined,
          companionWatchBundleId: undefined,
          isStandalone: true,
          platforms: [WATCH_SIMULATOR_PLATFORM],
        });

        const outerAppPath = await writeAppBundle(tmpDir, 'Foo.app', {
          CFBundleIdentifier: 'com.acme.foo',
          CFBundleSupportedPlatforms: [IOS_SIMULATOR_PLATFORM],
          WKWatch1To1CompanionKey: {BundleIdentifier: 'com.acme.foo.watchapp'},
        });
        assert.deepStrictEqual(await cache.extractWatchAppInfo(outerAppPath), {
          bundleId: 'com.acme.foo',
          companionAppBundleId: undefined,
          companionWatchBundleId: 'com.acme.foo.watchapp',
          isStandalone: false,
          platforms: [IOS_SIMULATOR_PLATFORM],
        });
      } finally {
        await fs.rimraf(tmpDir);
      }
    });

    it('should keep reporting invalid supported platforms', async function () {
      const cache = new AppInfosCache(log);
      const tmpDir = await tempDir.openDir();
      try {
        const brokenAppPath = await writeAppBundle(tmpDir, 'Broken.app', {
          CFBundleIdentifier: 'com.acme.broken',
          CFBundleSupportedPlatforms: WATCH_SIMULATOR_PLATFORM,
        });
        await assert.rejects(
          () => cache.extractAppPlatforms(brokenAppPath),
          /Broken\.app': CFBundleSupportedPlatforms is not a valid list/,
        );
        await assert.rejects(
          () => cache.extractWatchAppInfo(brokenAppPath),
          /Broken\.app': CFBundleSupportedPlatforms is not a valid list/,
        );
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
