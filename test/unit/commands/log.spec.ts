import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {createSandbox, type SinonSandbox, type SinonStub} from 'sinon';
import WebSocket from 'ws';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('logs broadcast', function () {
  let sandbox: SinonSandbox;
  let driver: XCUITestDriver;
  let syslog: EventEmitter;
  let addWebSocketHandlerStub: SinonStub;

  function makeFakeSocket() {
    const socket = new EventEmitter() as EventEmitter & {readyState: number; send: SinonStub};
    socket.readyState = WebSocket.OPEN;
    socket.send = sandbox.stub();
    return socket;
  }

  async function startBroadcast(): Promise<EventEmitter> {
    await driver.mobileStartLogsBroadcast();
    return addWebSocketHandlerStub.firstCall.args[1];
  }

  beforeEach(function () {
    sandbox = createSandbox();
    driver = new XCUITestDriver({} as any);
    driver.sessionId = 'session-id';
    syslog = new EventEmitter();
    driver.logs.syslog = syslog as any;
    addWebSocketHandlerStub = sandbox.stub().resolves();
    driver.server = {
      getWebSocketHandlers: sandbox.stub().resolves({}),
      addWebSocketHandler: addWebSocketHandlerStub,
      removeWebSocketHandler: sandbox.stub().resolves(true),
    } as any;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('sends each syslog line once to every connected client', async function () {
    const wss = await startBroadcast();
    const client1 = makeFakeSocket();
    const client2 = makeFakeSocket();
    wss.emit('connection', client1);
    wss.emit('connection', client2);

    syslog.emit('output', {message: 'line 1'});
    syslog.emit('output', {message: 'line 2'});

    assert.deepStrictEqual(client1.send.args, [['line 1'], ['line 2']]);
    assert.deepStrictEqual(client2.send.args, [['line 1'], ['line 2']]);
  });

  it('keeps streaming to the remaining clients and detaches from syslog after the last one closes', async function () {
    const wss = await startBroadcast();
    const client1 = makeFakeSocket();
    const client2 = makeFakeSocket();
    wss.emit('connection', client1);
    wss.emit('connection', client2);
    assert.strictEqual(syslog.listenerCount('output'), 1);

    client1.readyState = WebSocket.CLOSED;
    client1.emit('close', 1000, Buffer.from(''));
    assert.strictEqual(syslog.listenerCount('output'), 1);
    syslog.emit('output', {message: 'line 1'});
    assert.strictEqual(client1.send.callCount, 0);
    assert.deepStrictEqual(client2.send.args, [['line 1']]);

    client2.readyState = WebSocket.CLOSED;
    client2.emit('close', 1000, Buffer.from(''));
    assert.strictEqual(syslog.listenerCount('output'), 0);
  });

  it('streams to a client that connects after all previous clients have closed', async function () {
    const wss = await startBroadcast();
    const client1 = makeFakeSocket();
    wss.emit('connection', client1);
    client1.readyState = WebSocket.CLOSED;
    client1.emit('close', 1000, Buffer.from(''));

    const client2 = makeFakeSocket();
    wss.emit('connection', client2);
    syslog.emit('output', {message: 'line 1'});

    assert.strictEqual(client1.send.callCount, 0);
    assert.deepStrictEqual(client2.send.args, [['line 1']]);
    assert.strictEqual(syslog.listenerCount('output'), 1);
  });

  it('does not send to clients that are no longer open', async function () {
    const wss = await startBroadcast();
    const client1 = makeFakeSocket();
    const client2 = makeFakeSocket();
    wss.emit('connection', client1);
    wss.emit('connection', client2);

    client1.readyState = WebSocket.CLOSING;
    syslog.emit('output', {message: 'line 1'});

    assert.strictEqual(client1.send.callCount, 0);
    assert.deepStrictEqual(client2.send.args, [['line 1']]);
  });

  it('logs the close code and reason', async function () {
    const debugSpy = sandbox.spy(driver.log, 'debug');
    const wss = await startBroadcast();
    const client = makeFakeSocket();
    wss.emit('connection', client);

    client.emit('close', 1001, Buffer.from('going away'));

    assert.ok(debugSpy.calledWith('System logs listener web socket is closed. Code: 1001. Reason: going away.'));
  });
});
