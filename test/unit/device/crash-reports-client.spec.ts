import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {CrashReportsClient} from '../../../lib/device/crash-reports-client.js';
import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';

type Tree = Record<string, string[]>;

/**
 * Builds a fake crash-reports service whose `ls` lists the given directories and rejects for
 * anything else, like AFC `listdir` does for files.
 */
function mockService(tree: Tree) {
  return {
    ls: sinon.stub().callsFake(async (dirPath: string) => {
      const children = tree[dirPath];
      if (!children) {
        throw new Error(`'${dirPath}' is not a directory`);
      }
      return children.map((child) => (dirPath === '/' ? `/${child}` : `${dirPath}/${child}`));
    }),
    pull: sinon.stub().resolves(),
    close: sinon.stub(),
  };
}

async function createClient(service: ReturnType<typeof mockService>): Promise<CrashReportsClient> {
  const facade = {requireTunnelService: sinon.stub().resolves(service)} as unknown as RemoteXPCFacade;
  return await CrashReportsClient.create('udid', facade);
}

describe('CrashReportsClient', function () {
  it('exports listed crash reports without walking the device tree again', async function () {
    const service = mockService({
      '/': ['a.ips', 'Retired', 'notes.txt'],
      '/Retired': ['b.ips'],
    });
    const client = await createClient(service);

    assert.deepStrictEqual(await client.listCrashes(), ['a.ips', 'b.ips']);
    const lsCallsAfterListing = service.ls.callCount;
    await client.exportCrash('a.ips', '/dst');
    await client.exportCrash('b.ips', '/dst');

    assert.strictEqual(service.ls.callCount, lsCallsAfterListing);
    assert.deepStrictEqual(
      service.pull.getCalls().map(({args}) => args),
      [
        ['/dst', '/a.ips'],
        ['/dst', '/Retired/b.ips'],
      ],
    );
  });
});
