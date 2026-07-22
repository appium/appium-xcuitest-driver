import type {AppiumLogger} from '@appium/types';
import {logger} from 'appium/support.js';

export const log: AppiumLogger = logger.getLogger('XCUITest');
