import type {AppiumLogger} from '@appium/types';
import {logger} from 'appium/support';

export const log: AppiumLogger = logger.getLogger('XCUITest');
