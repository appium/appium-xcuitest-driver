import path from 'node:path';
import { fs, net, tempDir, zip } from 'appium/support';

const UICATALOG_URL = 'https://github.com/appium/ios-uicatalog/releases/download/v4.0.1/UIKitCatalog-iphonesimulator.zip';
const UICATALOG_CACHE_PATH = path.resolve(__dirname, 'fixtures', 'UIKitCatalog-iphonesimulator.app');
export const UICATALOG_BUNDLE_ID = 'com.example.apple-samplecode.UICatalog';

const TESTAPP_URL = 'https://github.com/appium/VodQAReactNative/releases/download/v1.2.5/VodQAReactNative-simulator-release.zip';
const TESTAPP_CACHE_PATH = path.resolve(__dirname, 'fixtures', 'VodQAReactNative.app');
export const TESTAPP_BUNDLE_ID = 'org.reactjs.native.example.VodQAReactNative';

// Cache the download promises to prevent concurrent downloads
const downloadPromises = new Map();

/**
 * Finds .app bundles in a directory (similar to findApps in app-utils.js)
 * @param {string} searchPath Directory to search in
 * @returns {Promise<string[]>} Array of relative paths to .app bundles
 */
async function findApps(searchPath) {
  const globPattern = '**/*.app';
  const sortedBundleItems = (
    await fs.glob(globPattern, {
      cwd: searchPath,
    })
  ).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return sortedBundleItems;
}

/**
 * Downloads and extracts an app from a zip URL if it doesn't already exist locally.
 * This function handles concurrent requests by reusing the same download promise.
 *
 * @param {string} url The URL to download the zip file from
 * @param {string} cachePath The path where the app should be cached
 * @param {string} zipFileName The name to use for the temporary zip file
 * @returns {Promise<string>} The path to the cached app directory
 * @throws {Error} If the download or extraction fails
 */
async function downloadAndExtractApp(url, cachePath, zipFileName) {
  // If a download is already in progress, wait for it first
  // This prevents returning a partially downloaded file
  if (downloadPromises.has(cachePath)) {
    return downloadPromises.get(cachePath);
  }

  // Check if the app already exists locally (only after ensuring no download is in progress)
  if (await fs.exists(cachePath)) {
    return cachePath;
  }

  // Start the download
  const downloadPromise = (async () => {
    try {
      // Double-check if file exists (another process might have downloaded it)
      if (await fs.exists(cachePath)) {
        return cachePath;
      }

      // Ensure the fixtures directory exists
      const fixturesDir = path.dirname(cachePath);
      await fs.mkdir(fixturesDir, {recursive: true});

      // Create a temporary directory for the zip file
      const tmpDir = await tempDir.openDir();
      const zipPath = path.join(tmpDir, zipFileName);

      try {
        // Download the zip file
        await net.downloadFile(url, zipPath);

        // Extract the zip file
        const extractDir = await tempDir.openDir();
        try {
          await zip.extractAllTo(zipPath, extractDir);

          // Find the .app bundle in the extracted directory
          const appPaths = await findApps(extractDir);
          if (appPaths.length === 0) {
            throw new Error('Could not find any .app bundle in the extracted zip file');
          }

          // Use the first (shallowest) .app bundle found
          const extractedAppPath = path.join(extractDir, appPaths[0]);
          await fs.mv(extractedAppPath, cachePath, {mkdirp: true});
        } finally {
          await fs.rimraf(extractDir);
        }
      } finally {
        await fs.rimraf(tmpDir);
      }

      return cachePath;
    } finally {
      // Clear the promise so future calls can download again if needed
      downloadPromises.delete(cachePath);
    }
  })();

  downloadPromises.set(cachePath, downloadPromise);
  return downloadPromise;
}

/**
 * Downloads and extracts the UIKitCatalog app from GitHub if it doesn't already exist locally.
 * This function handles concurrent requests by reusing the same download promise.
 *
 * @returns {Promise<string>} The path to the cached app directory
 * @throws {Error} If the download or extraction fails
 */
export async function getUIKitCatalogPath() {
  return downloadAndExtractApp(
    UICATALOG_URL,
    UICATALOG_CACHE_PATH,
    'UIKitCatalog-iphonesimulator.zip'
  );
}

/**
 * Downloads and extracts the VodQAReactNative (TestApp) app from GitHub if it doesn't already exist locally.
 * This function handles concurrent requests by reusing the same download promise.
 *
 * @returns {Promise<string>} The path to the cached app directory
 * @throws {Error} If the download or extraction fails
 */
export async function getTestAppPath() {
  return downloadAndExtractApp(
    TESTAPP_URL,
    TESTAPP_CACHE_PATH,
    'VodQAReactNative-simulator-release.zip'
  );
}

