import contextCommands from './context';
import executeExtensions from './execute';
import gestureExtensions from './gesture';
import findExtensions from './find';
import proxyHelperExtensions from './proxy-helper';
import alertExtensions from './alert';
import sourceExtensions from './source';
import generalExtensions from './general';
import logExtensions from './log';
import webExtensions from './web';
import timeoutExtensions from './timeouts';
import navigationExtensions from './navigation';
import elementExtensions from './element';
import fileMovementExtensions from './file-movement';
import screenshotExtensions from './screenshots';
import pasteboardExtensions from './pasteboard';
import locationExtensions from './location';
import recordAudioExtensions from './record-audio';
import recordScreenExtensions from './recordscreen';
import lockExtensions from './lock';
import appManagementExtensions from './app-management';
import performanceExtensions from './performance';
import clipboardExtensions from './clipboard';
import certificateExtensions from './certificate';
import batteryExtensions from './battery';
import deviceInfoExtensions from './deviceInfo';
import activeAppInfoExtensions from './activeAppInfo';
import cookiesExtensions from './cookies';
import biometricExtensions from './biometric';
import keychainsExtensions from './keychains';
import permissionsExtensions from './permissions';
import appearanceExtensions from './appearance';
import xctestExtensions from './xctest';
import notificationsExtensions from './notifications';
import iohidExtensions from './iohid';
import localizationExtensions from './localization';

const commands = {};

Object.assign(commands, contextCommands, executeExtensions,
  gestureExtensions, findExtensions, proxyHelperExtensions, sourceExtensions,
  generalExtensions, logExtensions, webExtensions, timeoutExtensions,
  navigationExtensions, elementExtensions, fileMovementExtensions,
  alertExtensions, screenshotExtensions, pasteboardExtensions, locationExtensions,
  lockExtensions, recordScreenExtensions, appManagementExtensions, performanceExtensions,
  clipboardExtensions, certificateExtensions, batteryExtensions, cookiesExtensions,
  biometricExtensions, keychainsExtensions, permissionsExtensions, deviceInfoExtensions,
  activeAppInfoExtensions, recordAudioExtensions, appearanceExtensions, xctestExtensions,
  notificationsExtensions, iohidExtensions, localizationExtensions,
);

export default commands;
