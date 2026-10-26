import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {AfcClient} from '../../../lib/device/afc-client.js';

function createClient(service: Record<string, unknown>): AfcClient {
  return Reflect.construct(AfcClient, [service]);
}

describe('AfcClient.deleteDirectory', function () {
  it('rejects with the stat error for a missing path without removing anything', async function () {
    const service = {
      stat: sinon.stub().rejects(new Error('AFC error: OBJECT_NOT_FOUND for operation GET_FILE_INFO')),
      rm: sinon.stub().resolves([]),
    };

    await assert.rejects(createClient(service).deleteDirectory('/missing'), /OBJECT_NOT_FOUND/);
    assert.strictEqual(service.rm.called, false);
  });

  it('does not report other stat failures as a missing path', async function () {
    const service = {stat: sinon.stub().rejects(new Error('AFC error: PERM_DENIED')), rm: sinon.stub().resolves([])};

    await assert.rejects(
      createClient(service).deleteDirectory('/protected'),
      (err: Error) => /PERM_DENIED/.test(err.message) && !/OBJECT_NOT_FOUND/.test(err.message),
    );
    assert.strictEqual(service.rm.called, false);
  });

  it('removes an existing path recursively', async function () {
    const service = {stat: sinon.stub().resolves({}), rm: sinon.stub().resolves([])};

    await createClient(service).deleteDirectory('/dir');
    assert.deepStrictEqual(service.rm.firstCall.args, ['/dir', true]);
  });

  it('reports the paths that could not be removed', async function () {
    const service = {stat: sinon.stub().resolves({}), rm: sinon.stub().resolves(['/dir/locked'])};

    await assert.rejects(createClient(service).deleteDirectory('/dir'), /\/dir\/locked/);
  });
});
