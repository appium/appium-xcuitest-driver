/**
 * Type definitions for appium-ios-remotexpc services
 *
 * This file centralizes all RemoteXPC-related type definitions to avoid
 * circular dependencies and provide a single source of truth for types.
 */

/**
 * RemoteXPC connection interface
 */
export interface RemoteXPCConnection {
  close(): Promise<void>;
}

/**
 * Diagnostics service for iOS 18+ devices
 */
export interface RemoteXPCDiagnosticsService {
  ioregistry(options: {
    ioClass: string;
    returnRawJson: boolean;
  }): Promise<Record<string, any>>;
}

/**
 * Condition inducer for DVT service
 */
export interface ConditionInducer {
  list(): Promise<any>;
  set(profileId: string): Promise<void>;
  disable(): Promise<void>;
}

/**
 * DVT Service with connection (used by condition inducer)
 */
export interface DVTServiceWithConnection {
  conditionInducer: ConditionInducer;
  remoteXPC: RemoteXPCConnection;
}

/**
 * RemoteXPC Services interface
 *
 * Main interface for the Services object exported from appium-ios-remotexpc
 */
export interface RemoteXPCServices {
  /**
   * Start DVT (Developer Tools) service for condition inducers
   */
  startDVTService(udid: string): Promise<DVTServiceWithConnection>;

  /**
   * Start diagnostics service for battery info and other diagnostics
   */
  startDiagnosticsService(udid: string): Promise<{
    diagnosticsService: RemoteXPCDiagnosticsService;
    remoteXPC: RemoteXPCConnection;
  }>;
}
