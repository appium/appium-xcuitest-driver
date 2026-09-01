import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import {AutomationSessionBackend} from '../../../lib/web-execution/automation-session-backend.js';

function wrapped(elementId: string) {
  return {ELEMENT: elementId, 'element-6066-11e4-a52e-4f735466cecf': elementId};
}

describe('AutomationSessionBackend', function () {
  let sandbox: sinon.SinonSandbox;
  let session: Record<string, sinon.SinonStub>;
  let backend: AutomationSessionBackend;

  beforeEach(function () {
    sandbox = createSandbox();
    session = {};
    backend = new AutomationSessionBackend(session as any);
  });

  afterEach(function () {
    sandbox.restore();
  });

  function stub(name: string, resolvedValue?: unknown): sinon.SinonStub {
    const s = sandbox.stub().resolves(resolvedValue);
    session[name] = s;
    return s;
  }

  describe('single-element delegations wrap the raw element id', function () {
    const cases: [string, string, unknown[], unknown[]][] = [
      ['getText', 'getText', [], []],
      ['getTagName', 'getTagName', [], []],
      ['isDisplayed', 'isDisplayed', [], []],
      ['isEnabled', 'isEnabled', [], []],
      ['isSelected', 'isSelected', [], []],
      ['elementScreenshot', 'elementScreenshot', [], []],
      ['getAttribute', 'getAttribute', ['name'], ['name']],
      ['getProperty', 'getProperty', ['name'], ['name']],
      ['getCssValue', 'getCssValue', ['color'], ['color']],
    ];

    for (const [backendMethod, sessionMethod, extraArgs, expectedExtraArgs] of cases) {
      it(`${backendMethod} delegates to session.${sessionMethod} with a wrapped element`, async function () {
        const s = stub(sessionMethod, 'the-result');
        const result = await (backend as any)[backendMethod]('el-123', ...extraArgs);
        assert.strictEqual(result, 'the-result');
        assert.strictEqual(s.calledOnce, true);
        assert.deepStrictEqual(s.firstCall.args, [wrapped('el-123'), ...expectedExtraArgs]);
      });
    }

    const voidCases: [string, string][] = [
      ['click', 'click'],
      ['clear', 'clear'],
      ['submit', 'submit'],
    ];
    for (const [backendMethod, sessionMethod] of voidCases) {
      it(`${backendMethod} delegates to session.${sessionMethod} with a wrapped element`, async function () {
        const s = stub(sessionMethod);
        await (backend as any)[backendMethod]('el-123');
        assert.deepStrictEqual(s.firstCall.args, [wrapped('el-123')]);
      });
    }
  });

  describe('getRect', function () {
    it('converts session.getRect page-relative coordinates to viewport-relative by subtracting the scroll offset', async function () {
      const getRectStub = stub('getRect', {x: 150, y: 250, width: 40, height: 20});
      const scriptStub = stub('executeScript', [100, 200]);

      const result = await backend.getRect('el-123');

      assert.deepStrictEqual(result, {x: 50, y: 50, width: 40, height: 20});
      assert.deepStrictEqual(getRectStub.firstCall.args, [wrapped('el-123')]);
      assert.strictEqual(scriptStub.calledOnce, true);
    });
  });

  describe('switchToWindow', function () {
    it('delegates to session.switchToWindow with the given handle', async function () {
      const s = stub('switchToWindow');
      await backend.switchToWindow('page-ABC123');
      assert.strictEqual(s.calledOnceWithExactly('page-ABC123'), true);
    });
  });

  describe('sendKeys', function () {
    it('joins an array value into a single string', async function () {
      const s = stub('sendKeys');
      await backend.sendKeys('el-1', ['a', 'b', 'c']);
      assert.deepStrictEqual(s.firstCall.args, [wrapped('el-1'), 'abc']);
    });

    it('stringifies a numeric value', async function () {
      const s = stub('sendKeys');
      await backend.sendKeys('el-1', 42);
      assert.deepStrictEqual(s.firstCall.args, [wrapped('el-1'), '42']);
    });

    it('passes a string value through untouched', async function () {
      const s = stub('sendKeys');
      await backend.sendKeys('el-1', 'hello');
      assert.deepStrictEqual(s.firstCall.args, [wrapped('el-1'), 'hello']);
    });
  });

  describe('no-arg passthroughs that return a value', function () {
    const cases: [string, string][] = [
      ['getCurrentUrl', 'getCurrentUrl'],
      ['getTitle', 'getTitle'],
      ['getPageSource', 'getPageSource'],
      ['getWindowHandles', 'getWindowHandles'],
      ['getWindowRect', 'getWindowRect'],
      ['isShowingJavaScriptDialog', 'isShowingJavaScriptDialog'],
      ['getDialogMessage', 'getDialogMessage'],
      ['getActiveElement', 'getActiveElement'],
      ['getCookies', 'getCookies'],
    ];

    for (const [backendMethod, sessionMethod] of cases) {
      it(`${backendMethod} delegates straight to session.${sessionMethod}`, async function () {
        const s = stub(sessionMethod, 'the-value');
        const result = await (backend as any)[backendMethod]();
        assert.strictEqual(result, 'the-value');
        assert.strictEqual(s.calledOnceWithExactly(), true);
      });
    }
  });

  describe('no-arg passthroughs with no return value', function () {
    const cases: [string, string][] = [
      ['back', 'back'],
      ['forward', 'forward'],
      ['refresh', 'refresh'],
      ['switchToParentFrame', 'switchToParentFrame'],
      ['switchToDefaultContent', 'switchToDefaultContent'],
      ['maximizeWindow', 'maximizeWindow'],
      ['minimizeWindow', 'minimizeWindow'],
      ['fullscreenWindow', 'fullscreenWindow'],
      ['closeWindow', 'closeWindow'],
      ['deleteAllCookies', 'deleteAllCookies'],
      ['releaseActions', 'releaseActions'],
      ['acceptDialog', 'acceptDialog'],
      ['dismissDialog', 'dismissDialog'],
    ];

    for (const [backendMethod, sessionMethod] of cases) {
      it(`${backendMethod} delegates straight to session.${sessionMethod}`, async function () {
        const s = stub(sessionMethod);
        await (backend as any)[backendMethod]();
        assert.strictEqual(s.calledOnceWithExactly(), true);
      });
    }
  });

  it('navigate passes the url through to session.navigate', async function () {
    const s = stub('navigate');
    await backend.navigate('https://example.com');
    assert.strictEqual(s.calledOnceWithExactly('https://example.com'), true);
  });

  it('addCookie passes the cookie object through to session.addCookie', async function () {
    const s = stub('addCookie');
    const cookie = {name: 'a', value: 'b'};
    await backend.addCookie(cookie as any);
    assert.strictEqual(s.calledOnceWithExactly(cookie), true);
  });

  it('deleteCookie passes the name through to session.deleteCookie', async function () {
    const s = stub('deleteCookie');
    await backend.deleteCookie('a');
    assert.strictEqual(s.calledOnceWithExactly('a'), true);
  });

  it('setWindowRect passes x/y/width/height through to session.setWindowRect', async function () {
    const s = stub('setWindowRect');
    await backend.setWindowRect(1, 2, 3, 4);
    assert.strictEqual(s.calledOnceWithExactly(1, 2, 3, 4), true);
  });

  it('setDialogUserInput passes the input through to session.setDialogUserInput', async function () {
    const s = stub('setDialogUserInput');
    await backend.setDialogUserInput('hi');
    assert.strictEqual(s.calledOnceWithExactly('hi'), true);
  });

  it('executeScript passes script and args through, defaulting args to []', async function () {
    const s = stub('executeScript', 'result');
    const result = await backend.executeScript('return 1;', [1, 2]);
    assert.strictEqual(result, 'result');
    assert.strictEqual(s.calledOnceWithExactly('return 1;', [1, 2]), true);

    s.resetHistory();
    await backend.executeScript('return 1;');
    assert.strictEqual(s.calledOnceWithExactly('return 1;', []), true);
  });

  it('executeAsyncScript passes script and args through, defaulting args to []', async function () {
    const s = stub('executeAsyncScript', 'result');
    const result = await backend.executeAsyncScript('return 1;', [1]);
    assert.strictEqual(result, 'result');
    assert.strictEqual(s.calledOnceWithExactly('return 1;', [1]), true);
  });

  it('screenshot delegates to session.screenshot', async function () {
    const s = stub('screenshot', 'base64==');
    const result = await backend.screenshot();
    assert.strictEqual(result, 'base64==');
    assert.strictEqual(s.calledOnceWithExactly(), true);
  });

  it('screenshot delegates for the Viewport coordinate system too', async function () {
    const s = stub('screenshot', 'base64==');
    const result = await backend.screenshot('Viewport');
    assert.strictEqual(result, 'base64==');
    assert.strictEqual(s.calledOnceWithExactly(), true);
  });

  it('screenshot rejects the Page coordinate system - AutomationSession always clips to the viewport', async function () {
    stub('screenshot');
    await assert.rejects(backend.screenshot('Page'), errors.NotImplementedError);
  });

  it('performActions delegates to session.performW3CActions', async function () {
    const s = stub('performW3CActions');
    const actions = [{type: 'pointer', id: '1', actions: []}];
    await backend.performActions(actions as any);
    assert.strictEqual(s.calledOnceWithExactly(actions), true);
  });

  describe('findElement', function () {
    it('wraps the context element and returns whatever session.findElement finds', async function () {
      const found = wrapped('found-1');
      const s = stub('findElement', found);
      const result = await backend.findElement('css selector', '.foo', wrapped('ctx-1'));
      assert.strictEqual(result, found);
      assert.deepStrictEqual(s.firstCall.args, ['css selector', '.foo', wrapped('ctx-1')]);
    });

    it('calls session.findElement with no root when ctx is not provided', async function () {
      const s = stub('findElement', wrapped('found-1'));
      await backend.findElement('css selector', '.foo');
      assert.deepStrictEqual(s.firstCall.args, ['css selector', '.foo', undefined]);
    });

    it('throws NoSuchElementError when session.findElement resolves null', async function () {
      stub('findElement', null);
      await assert.rejects(backend.findElement('css selector', '.foo'), errors.NoSuchElementError);
    });
  });

  it('findElements wraps the context element and returns the array as-is', async function () {
    const found = [wrapped('a'), wrapped('b')];
    const s = stub('findElements', found);
    const result = await backend.findElements('xpath', '//div');
    assert.strictEqual(result, found);
    assert.deepStrictEqual(s.firstCall.args, ['xpath', '//div', undefined]);
  });

  describe('switchToFrame', function () {
    it('passes a numeric index straight through', async function () {
      const s = stub('switchToFrame');
      await backend.switchToFrame(2);
      assert.strictEqual(s.calledOnceWithExactly(2), true);
    });

    it('wraps an element target', async function () {
      const s = stub('switchToFrame');
      await backend.switchToFrame(wrapped('frame-el') as any);
      assert.strictEqual(s.calledOnceWithExactly(wrapped('frame-el')), true);
    });

    it('rejects a frame name/id target with NotImplementedError', async function () {
      await assert.rejects(backend.switchToFrame('myframe'), errors.NotImplementedError);
    });
  });

  describe('getWindowHandle', function () {
    it('returns session.currentWindowHandle when set', async function () {
      Object.defineProperty(session, 'currentWindowHandle', {value: 'handle-1', configurable: true});
      assert.strictEqual(await backend.getWindowHandle(), 'handle-1');
    });

    it('throws InvalidContextError when there is no current window handle', async function () {
      Object.defineProperty(session, 'currentWindowHandle', {value: undefined, configurable: true});
      await assert.rejects(backend.getWindowHandle(), errors.InvalidContextError);
    });
  });

  it('getAlertButtons always throws NotImplementedError - JS dialogs have no enumerable buttons', async function () {
    await assert.rejects(backend.getAlertButtons(), errors.NotImplementedError);
  });
});
