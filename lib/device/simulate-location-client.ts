import {services} from 'appium-ios-device';

/**
 * A simulate-location session over lockdown/USB (legacy path for real devices on iOS < 17).
 * Callers must invoke {@link SimulateLocationSession#close | close()} when finished (typically in `finally`).
 */
export interface SimulateLocationSession {
  setLocation(latitude: number, longitude: number): void;
  resetLocation(): void;
  close(): void;
}

type LegacySimulateLocationService = {
  setLocation(latitude: number, longitude: number): void;
  resetLocation(): void;
  close(): void;
};

class LegacySimulateLocationSession implements SimulateLocationSession {
  constructor(private readonly service: LegacySimulateLocationService) {}

  setLocation(latitude: number, longitude: number): void {
    this.service.setLocation(latitude, longitude);
  }

  resetLocation(): void {
    this.service.resetLocation();
  }

  close(): void {
    this.service.close();
  }
}

/**
 * Opens simulate-location sessions on the legacy `appium-ios-device` stack.
 * Real devices on iOS 17 and newer use WebDriverAgent (`mobile:setSimulatedLocation` / related commands) instead.
 */
export class SimulateLocationClient {
  /**
   * @param udid - Target device UDID
   * @returns A session; {@link SimulateLocationSession#close | close()} when done.
   */
  static async startSession(udid: string): Promise<SimulateLocationSession> {
    const service = await services.startSimulateLocationService(udid);
    return new LegacySimulateLocationSession(service as LegacySimulateLocationService);
  }
}
