import { getSimulator } from 'appium-ios-simulator';
import { createDevice } from 'node-simctl';

// returns true if sim is booted. false if not booted or doesnt exist
async function simBooted(udid) {
  let sim = await getSimulator(udid);
  let stat = await sim.stat();
  return stat.state === 'Booted';
}

// returns sim for desired caps
async function createSim(caps, sessionId) {
  let name = `appiumTest-${sessionId}`;
  let udid = await createDevice(name, caps.deviceName, caps.platformVersion);
  return await getSimulator(udid);
}

export { simBooted, createSim };
