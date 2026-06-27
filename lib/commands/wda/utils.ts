import path from 'node:path';
import type {WebDriverAgent} from 'appium-webdriveragent';

/**
 * Returns the WebDriverAgent derived data root from Xcode build settings.
 */
export async function getDerivedDataPath(wda: WebDriverAgent): Promise<string | undefined> {
  const buildSettings = await wda.retrieveBuildSettings({
    scheme: 'WebDriverAgentRunner',
  });
  const buildDir = buildSettings?.BUILD_DIR;
  return buildDir ? path.dirname(path.dirname(path.normalize(buildDir))) : undefined;
}
