import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import {viewportSignature} from '../../../lib/commands/web-native-bridge.js';
import {XCUITestDriver} from '../../../lib/driver.js';
import {AtomsBackend} from '../../../lib/web-execution/atoms-backend.js';

describe('AtomsBackend', function () {
  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;
  let backend: AtomsBackend;
  let executeAtomStub: sinon.SinonStub;
  let getAtomsElementStub: sinon.SinonStub;
  let remoteStub: Record<string, sinon.SinonStub>;

  beforeEach(function () {
    sandbox = createSandbox();
    driver = new XCUITestDriver({} as any);
    driver.curContext = 'fake web context';
    backend = new AtomsBackend(driver);
    executeAtomStub = sandbox.stub(driver, 'executeAtom');
    getAtomsElementStub = sandbox.stub(driver, 'getAtomsElement').callsFake((id: any) => ({ELEMENT: id}));
    remoteStub = {
      navToUrl: sandbox.stub(),
      execute: sandbox.stub(),
      captureScreenshot: sandbox.stub(),
      getCookies: sandbox.stub().resolves({cookies: []}),
      deleteCookie: sandbox.stub(),
      executeAtomAsync: sandbox.stub(),
    };
    driver._remote = remoteStub as any;
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('elements backed by a single atom call', function () {
    const cases: [string, string][] = [
      ['clear', 'clear'],
      ['submit', 'submit'],
      ['getText', 'get_text'],
      ['isDisplayed', 'is_displayed'],
      ['isEnabled', 'is_enabled'],
      ['isSelected', 'is_selected'],
    ];

    for (const [backendMethod, atomName] of cases) {
      it(`${backendMethod} looks up the atoms element and calls the '${atomName}' atom`, async function () {
        executeAtomStub.resolves('the-result');
        const result = await (backend as any)[backendMethod]('el-1');
        assert.strictEqual(getAtomsElementStub.calledOnceWithExactly('el-1'), true);
        assert.strictEqual(executeAtomStub.calledOnceWithExactly(atomName, [{ELEMENT: 'el-1'}]), true);
        if (backendMethod !== 'clear' && backendMethod !== 'submit') {
          assert.strictEqual(result, 'the-result');
        }
      });
    }
  });

  it('getTagName runs a tagName script against the atoms element', async function () {
    executeAtomStub.resolves('div');
    const result = await backend.getTagName('el-1');
    assert.strictEqual(result, 'div');
    assert.strictEqual(
      executeAtomStub.calledOnceWithExactly('execute_script', [
        'return arguments[0].tagName.toLowerCase()',
        [{ELEMENT: 'el-1'}],
      ]),
      true,
    );
  });

  it('getAttribute and getProperty both call the get_attribute_value atom', async function () {
    executeAtomStub.resolves('value');
    assert.strictEqual(await backend.getAttribute('el-1', 'href'), 'value');
    assert.strictEqual(executeAtomStub.calledWithExactly('get_attribute_value', [{ELEMENT: 'el-1'}, 'href']), true);

    executeAtomStub.resetHistory();
    assert.strictEqual(await backend.getProperty('el-1', 'checked'), 'value');
    assert.strictEqual(executeAtomStub.calledWithExactly('get_attribute_value', [{ELEMENT: 'el-1'}, 'checked']), true);
  });

  it('getCssValue calls the get_value_of_css_property atom', async function () {
    executeAtomStub.resolves('red');
    const result = await backend.getCssValue('el-1', 'color');
    assert.strictEqual(result, 'red');
    assert.strictEqual(
      executeAtomStub.calledOnceWithExactly('get_value_of_css_property', [{ELEMENT: 'el-1'}, 'color']),
      true,
    );
  });

  it('getRect composes get_top_left_coordinates and get_size', async function () {
    executeAtomStub.withArgs('get_top_left_coordinates').resolves({x: 1, y: 2});
    executeAtomStub.withArgs('get_size').resolves({width: 3, height: 4});
    const rect = await backend.getRect('el-1');
    assert.deepStrictEqual(rect, {x: 1, y: 2, width: 3, height: 4});
  });

  describe('elementScreenshot', function () {
    it('throws UnableToCaptureScreen for a zero-size element', async function () {
      executeAtomStub.withArgs('get_size').resolves({width: 0, height: 0});
      await assert.rejects(backend.elementScreenshot('el-1'), errors.UnableToCaptureScreen);
    });

    it('captures a screenshot scoped to the element rect', async function () {
      executeAtomStub.withArgs('get_size').resolves({width: 10, height: 20});
      executeAtomStub.withArgs('get_top_left_coordinates').resolves({x: 1, y: 2});
      remoteStub.captureScreenshot.resolves('base64==');
      const result = await backend.elementScreenshot('el-1');
      assert.strictEqual(result, 'base64==');
      assert.strictEqual(
        remoteStub.captureScreenshot.calledOnceWithExactly({rect: {x: 1, y: 2, width: 10, height: 20}}),
        true,
      );
    });
  });

  describe('click', function () {
    it('uses native web tap when the nativeWebTap setting is on', async function () {
      driver.opts.nativeWebTap = true;
      await driver.updateSettings({nativeWebTap: true});
      const nativeWebTapStub = sandbox.stub(driver, 'nativeWebTap');
      await backend.click('el-1');
      assert.strictEqual(nativeWebTapStub.calledOnceWithExactly('el-1'), true);
      assert.strictEqual(executeAtomStub.called, false);
    });

    it('runs the click atom by default', async function () {
      executeAtomStub.resolves();
      await backend.click('el-1');
      assert.strictEqual(executeAtomStub.calledOnceWithExactly('click', [{ELEMENT: 'el-1'}]), true);
    });

    it('swallows an UnexpectedAlertOpenError from the click atom', async function () {
      executeAtomStub.rejects({error: errors.UnexpectedAlertOpenError.error()});
      await backend.click('el-1');
    });

    it('rethrows any other error from the click atom', async function () {
      executeAtomStub.rejects(new Error('boom'));
      await assert.rejects(backend.click('el-1'), /boom/);
    });
  });

  describe('sendKeys', function () {
    let setValueWithWebAtomStub: sinon.SinonStub;

    beforeEach(function () {
      setValueWithWebAtomStub = sandbox.stub(driver, 'setValueWithWebAtom');
    });

    it('sends the whole value at once by default', async function () {
      driver.opts.sendKeyStrategy = undefined;
      await backend.sendKeys('el-1', 'hello');
      assert.strictEqual(setValueWithWebAtomStub.calledOnceWithExactly({ELEMENT: 'el-1'}, 'hello'), true);
    });

    it('sends one character at a time with the oneByOne strategy', async function () {
      driver.opts.sendKeyStrategy = 'oneByOne';
      await backend.sendKeys('el-1', 'ab');
      assert.strictEqual(setValueWithWebAtomStub.callCount, 2);
      assert.deepStrictEqual(setValueWithWebAtomStub.getCall(0).args, [{ELEMENT: 'el-1'}, 'a']);
      assert.deepStrictEqual(setValueWithWebAtomStub.getCall(1).args, [{ELEMENT: 'el-1'}, 'b']);
    });
  });

  it('navigate delegates to remote.navToUrl', async function () {
    await backend.navigate('https://example.com');
    assert.strictEqual(remoteStub.navToUrl.calledOnceWithExactly('https://example.com'), true);
  });

  describe('back/forward', function () {
    it('back delegates to mobileWebNav', async function () {
      const mobileWebNavStub = sandbox.stub(driver, 'mobileWebNav');
      await backend.back();
      assert.strictEqual(mobileWebNavStub.calledOnceWithExactly('back'), true);
    });

    it('forward delegates to mobileWebNav', async function () {
      const mobileWebNavStub = sandbox.stub(driver, 'mobileWebNav');
      await backend.forward();
      assert.strictEqual(mobileWebNavStub.calledOnceWithExactly('forward'), true);
    });
  });

  describe('script-execution style commands routed through waitForAtom', function () {
    let waitForAtomStub: sinon.SinonStub;

    beforeEach(function () {
      waitForAtomStub = sandbox.stub(driver, 'waitForAtom').callsFake((p: any) => p);
    });

    it('refresh reloads the page', async function () {
      remoteStub.execute.returns('resolved');
      await backend.refresh();
      assert.strictEqual(remoteStub.execute.calledOnceWithExactly('window.location.reload()'), true);
      assert.strictEqual(waitForAtomStub.calledOnce, true);
    });

    it('getCurrentUrl reads window.location.href', async function () {
      remoteStub.execute.returns('https://example.com');
      const result = await backend.getCurrentUrl();
      assert.strictEqual(result, 'https://example.com');
      assert.strictEqual(remoteStub.execute.calledOnceWithExactly('window.location.href'), true);
    });

    it('getTitle reads window.document.title', async function () {
      remoteStub.execute.returns('My Page');
      const result = await backend.getTitle();
      assert.strictEqual(result, 'My Page');
      assert.strictEqual(remoteStub.execute.calledOnceWithExactly('window.document.title'), true);
    });
  });

  it('getPageSource returns the outer HTML via a script atom', async function () {
    executeAtomStub.resolves('<html></html>');
    const result = await backend.getPageSource();
    assert.strictEqual(result, '<html></html>');
    assert.strictEqual(
      executeAtomStub.calledOnceWithExactly('execute_script', ['return document.documentElement.outerHTML', []]),
      true,
    );
  });

  describe('switchToFrame', function () {
    it('resolves an element target via get_frame_window', async function () {
      const el = {ELEMENT: 'frame-el', 'element-6066-11e4-a52e-4f735466cecf': 'frame-el'};
      executeAtomStub.withArgs('get_frame_window').resolves({WINDOW: 'win-1'});
      executeAtomStub.withArgs('execute_script').resolves(true);
      await backend.switchToFrame(el as any);
      assert.strictEqual(getAtomsElementStub.calledOnceWithExactly(el), true);
      assert.deepStrictEqual(driver.curWebFrames, ['win-1']);
    });

    it('resolves a numeric target via frame_by_index', async function () {
      executeAtomStub.withArgs('frame_by_index').resolves({WINDOW: 'win-2'});
      executeAtomStub.withArgs('execute_script').resolves(true);
      await backend.switchToFrame(2);
      assert.strictEqual(executeAtomStub.calledWithExactly('frame_by_index', [2]), true);
      assert.deepStrictEqual(driver.curWebFrames, ['win-2']);
    });

    it('resolves a string target via frame_by_id_or_name', async function () {
      executeAtomStub.withArgs('frame_by_id_or_name').resolves({WINDOW: 'win-3'});
      executeAtomStub.withArgs('execute_script').resolves(true);
      await backend.switchToFrame('myframe');
      assert.strictEqual(executeAtomStub.calledWithExactly('frame_by_id_or_name', ['myframe']), true);
    });

    it('throws NoSuchFrameError when the frame cannot be resolved', async function () {
      executeAtomStub.withArgs('frame_by_index').resolves(null);
      await assert.rejects(backend.switchToFrame(2), errors.NoSuchFrameError);
    });

    it('rolls curWebFrames back and rethrows if the probe script fails', async function () {
      executeAtomStub.withArgs('frame_by_index').resolves({WINDOW: 'win-4'});
      executeAtomStub.withArgs('execute_script').rejects(new Error('nope'));
      driver.curWebFrames = [];
      await assert.rejects(backend.switchToFrame(2), /nope/);
      assert.deepStrictEqual(driver.curWebFrames, []);
    });

    it('rewrites a cross-origin failure into a friendlier error', async function () {
      executeAtomStub.withArgs('frame_by_index').rejects(new Error('blocked a frame with origin "x"'));
      await assert.rejects(backend.switchToFrame(2), /Cannot switch into this frame/);
    });
  });

  it('switchToParentFrame is not implemented for atoms', async function () {
    await assert.rejects(backend.switchToParentFrame(), errors.NotImplementedError);
  });

  it('switchToDefaultContent clears curWebFrames locally with no atom call', async function () {
    driver.curWebFrames = ['a', 'b'];
    await backend.switchToDefaultContent();
    assert.deepStrictEqual(driver.curWebFrames, []);
    assert.strictEqual(executeAtomStub.called, false);
  });

  it('getActiveElement caches the result of the active_element atom', async function () {
    executeAtomStub.withArgs('active_element').resolves({ELEMENT: 'active-1'});
    const cacheWebElementsStub = sandbox.stub(driver, 'cacheWebElements').returns('cached');
    const result = await backend.getActiveElement();
    assert.strictEqual(result, 'cached');
    assert.strictEqual(cacheWebElementsStub.calledOnceWithExactly({ELEMENT: 'active-1'}), true);
  });

  it('getWindowHandle returns the driver curContext', async function () {
    driver.curContext = 'app.5';
    assert.strictEqual(await backend.getWindowHandle(), 'app.5');
  });

  it('getWindowHandles filters out the native context from getContextsAndViews', async function () {
    sandbox.stub(driver, 'getContextsAndViews').resolves([
      {id: 'NATIVE_APP', view: {}},
      {id: 'app.5', view: {id: 5}},
      {id: 'app.6', view: {id: 6}},
    ] as any);
    const handles = await backend.getWindowHandles();
    assert.deepStrictEqual(handles, ['5', '6']);
  });

  it('getWindowRect runs a window-size script atom', async function () {
    executeAtomStub.resolves({x: 0, y: 0, width: 100, height: 200});
    const rect = await backend.getWindowRect();
    assert.deepStrictEqual(rect, {x: 0, y: 0, width: 100, height: 200});
    assert.strictEqual(executeAtomStub.firstCall.args[0], 'execute_script');
  });

  describe('window sizing has no atoms equivalent', function () {
    const methods = ['setWindowRect', 'maximizeWindow', 'minimizeWindow', 'fullscreenWindow'] as const;
    for (const method of methods) {
      it(`${method} throws NotImplementedError`, async function () {
        await assert.rejects((backend as any)[method](), errors.NotImplementedError);
      });
    }
  });

  describe('closeWindow', function () {
    it('runs the closing script and waits for curContext to change', async function () {
      executeAtomStub.resolves(true);
      driver.curContext = 'app.5';
      const promise = backend.closeWindow();
      // simulate the context flipping shortly after the close script runs
      setImmediate(() => {
        driver.curContext = null;
      });
      await promise;
      assert.strictEqual(executeAtomStub.calledOnce, true);
      assert.strictEqual(executeAtomStub.firstCall.args[2], true);
    });
  });

  describe('cookies', function () {
    it('getCookies decodes URI-encoded values', async function () {
      remoteStub.getCookies.resolves({cookies: [{name: 'a', value: 'hello%20world'}]});
      const cookies = await backend.getCookies();
      assert.strictEqual(cookies[0].value, 'hello world');
    });

    it('addCookie builds a document.cookie script from the cookie fields', async function () {
      executeAtomStub.resolves();
      await backend.addCookie({name: 'a', value: 'b', path: '/', domain: 'example.com'} as any);
      assert.strictEqual(executeAtomStub.calledOnce, true);
      const [atomName, args] = executeAtomStub.firstCall.args;
      assert.strictEqual(atomName, 'execute_script');
      assert.match(args[0] as string, /document\.cookie = /);
    });

    it('deleteCookie is a no-op when the cookie is not present', async function () {
      remoteStub.getCookies.resolves({cookies: []});
      await backend.deleteCookie('missing');
      assert.strictEqual(remoteStub.deleteCookie.called, false);
    });

    it('deleteCookie deletes a matching cookie by name via the remote debugger', async function () {
      remoteStub.getCookies.resolves({cookies: [{name: 'a', value: 'b', domain: 'example.com', path: '/'}]});
      await backend.deleteCookie('a');
      assert.strictEqual(remoteStub.deleteCookie.calledOnceWithExactly('a', 'http://example.com/'), true);
    });

    it('deleteAllCookies deletes every cookie currently set', async function () {
      remoteStub.getCookies.resolves({
        cookies: [
          {name: 'a', value: '1', domain: 'example.com', path: '/'},
          {name: 'b', value: '2', domain: 'example.com', path: '/'},
        ],
      });
      await backend.deleteAllCookies();
      assert.strictEqual(remoteStub.deleteCookie.callCount, 2);
    });
  });

  describe('script execution', function () {
    it('executeScript converts args for atoms and caches the result', async function () {
      const convertStub = sandbox.stub(driver, 'convertElementsForAtoms').returns(['converted']);
      const cacheStub = sandbox.stub(driver, 'cacheWebElements').returns('cached');
      executeAtomStub.resolves('raw');
      const result = await backend.executeScript('return 1;', ['arg']);
      assert.strictEqual(result, 'cached');
      assert.strictEqual(convertStub.calledOnceWithExactly(['arg']), true);
      assert.strictEqual(executeAtomStub.calledOnceWithExactly('execute_script', ['return 1;', ['converted']]), true);
      assert.strictEqual(cacheStub.calledOnceWithExactly('raw'), true);
    });

    it('executeAsyncScript delegates to remote.executeAtomAsync and caches the result', async function () {
      const convertStub = sandbox.stub(driver, 'convertElementsForAtoms').returns(['converted']);
      const cacheStub = sandbox.stub(driver, 'cacheWebElements').returns('cached');
      const waitForAtomStub = sandbox.stub(driver, 'waitForAtom').resolves('raw');
      const theAtomPromise = Promise.resolve('unused');
      remoteStub.executeAtomAsync.returns(theAtomPromise);
      const result = await backend.executeAsyncScript('return 1;', ['arg']);
      assert.strictEqual(result, 'cached');
      assert.strictEqual(
        remoteStub.executeAtomAsync.calledOnceWithExactly(
          'execute_async_script',
          ['return 1;', ['converted'], 0],
          driver.curWebFrames,
        ),
        true,
      );
      assert.strictEqual(convertStub.calledOnceWithExactly(['arg']), true);
      assert.strictEqual(waitForAtomStub.calledOnceWithExactly(theAtomPromise), true);
      assert.strictEqual(cacheStub.calledOnceWithExactly('raw'), true);
    });
  });

  it('screenshot delegates to remote.captureScreenshot with the given coordinate system', async function () {
    remoteStub.captureScreenshot.resolves('base64==');
    const result = await backend.screenshot('Page');
    assert.strictEqual(result, 'base64==');
    assert.strictEqual(remoteStub.captureScreenshot.calledOnceWithExactly({coordinateSystem: 'Page'}), true);

    remoteStub.captureScreenshot.resetHistory();
    await backend.screenshot();
    assert.strictEqual(remoteStub.captureScreenshot.calledOnceWithExactly(undefined), true);
  });

  it('performActions has no atoms implementation, but still proxies non-web-element sequences to WDA', async function () {
    const proxyStub = sandbox.stub(driver, 'proxyCommand').resolves();
    const actions = [{type: 'pointer', id: 'finger1', parameters: {pointerType: 'mouse'}, actions: []}] as any;

    await backend.performActions(actions);

    assert.strictEqual(proxyStub.calledOnce, true);
    assert.strictEqual(proxyStub.firstCall.args[0], '/actions');
  });

  it('performActions resolves a web-element origin to native coordinates before proxying to WDA', async function () {
    const proxyStub = sandbox.stub(driver, 'proxyCommand').resolves();
    executeAtomStub.withArgs('get_size').resolves({width: 40, height: 20});
    executeAtomStub.withArgs('get_top_left_coordinates').resolves({x: 100, y: 200});
    driver.webElementsCache.set(':wdc:123', ':wdc:123');

    // translateWebCoords is no longer a stubbable driver method (it's imported directly from
    // web-native-bridge.js), so drive its real calibration transform instead: an identity
    // transform pre-seeded into the cache under the signature it will actually compute from the
    // (stubbed) viewport state, so no real calibration tap sequence runs.
    sandbox.stub(driver, 'waitForAtom').callsFake((p: any) => p);
    const viewportState = {
      innerWidth: 400,
      innerHeight: 800,
      outerWidth: 400,
      outerHeight: 800,
      isScrolledToTop: true,
      visualViewportWidth: 400,
      visualViewportHeight: 800,
      visualViewportOffsetLeft: 0,
      visualViewportOffsetTop: 0,
      visualViewportScale: 1,
    };
    remoteStub.execute.returns(viewportState);
    driver._webviewCalibrationCache = {
      signature: `${driver.curContext}::${viewportSignature({...viewportState, orientation: 'PORTRAIT'})}`,
      data: {offsetX: 0, offsetY: 0, pixelRatioX: 1, pixelRatioY: 1},
    };

    const actions = [
      {
        type: 'pointer',
        id: 'finger1',
        actions: [{type: 'pointerMove', duration: 0, origin: {ELEMENT: ':wdc:123'}, x: 5, y: -5}],
      },
    ] as any;

    await backend.performActions(actions);

    assert.strictEqual(proxyStub.calledOnce, true);
    const proxiedAction = (proxyStub.firstCall.args[2] as any).actions[0].actions[0];
    assert.strictEqual(proxiedAction.origin, 'viewport');
    // identity transform, so native coords equal the web ones: center (100 + 20, 200 + 10)
    // offset by the action's own (5, -5)
    assert.strictEqual(proxiedAction.x, 125);
    assert.strictEqual(proxiedAction.y, 205);
  });

  it('performActions leaves a native element origin untouched - it is shaped just like a web element, but is not one', async function () {
    const proxyStub = sandbox.stub(driver, 'proxyCommand').resolves();
    // never cached via the web-execution machinery, so this is a native element, not a web one
    const actions = [
      {
        type: 'pointer',
        id: 'finger1',
        actions: [{type: 'pointerMove', duration: 0, origin: {ELEMENT: 'native-element-id'}, x: 5, y: -5}],
      },
    ] as any;

    await backend.performActions(actions);

    assert.strictEqual(executeAtomStub.called, false);
    const proxiedAction = (proxyStub.firstCall.args[2] as any).actions[0].actions[0];
    assert.deepStrictEqual(proxiedAction.origin, {ELEMENT: 'native-element-id'});
  });

  it('releaseActions is a harmless no-op', async function () {
    await backend.releaseActions();
  });

  describe('JS dialogs fall back to the native alert proxy', function () {
    let proxyStub: sinon.SinonStub;

    beforeEach(function () {
      proxyStub = sandbox.stub(driver, 'proxyCommand');
    });

    it('isShowingJavaScriptDialog reuses checkForAlert', async function () {
      const getAlertTextStub = sandbox.stub(driver, 'getAlertText').resolves('some alert text');
      assert.strictEqual(await backend.isShowingJavaScriptDialog(), true);
      assert.strictEqual(getAlertTextStub.calledOnce, true);
    });

    it('getDialogMessage returns the proxied alert text', async function () {
      proxyStub.resolves('hi');
      assert.strictEqual(await backend.getDialogMessage(), 'hi');
      assert.strictEqual(proxyStub.calledOnceWithExactly('/alert/text', 'GET'), true);
    });

    it('getDialogMessage throws NoAlertOpenError when there is no alert', async function () {
      proxyStub.resolves(null);
      await assert.rejects(backend.getDialogMessage(), errors.NoAlertOpenError);
    });

    it('acceptDialog proxies to /alert/accept', async function () {
      await backend.acceptDialog();
      assert.strictEqual(proxyStub.calledOnceWithExactly('/alert/accept', 'POST', {}), true);
    });

    it('dismissDialog proxies to /alert/dismiss', async function () {
      await backend.dismissDialog();
      assert.strictEqual(proxyStub.calledOnceWithExactly('/alert/dismiss', 'POST', {}), true);
    });

    it('setDialogUserInput proxies to /alert/text', async function () {
      await backend.setDialogUserInput('hi');
      assert.strictEqual(proxyStub.calledOnceWithExactly('/alert/text', 'POST', {value: 'hi'}), true);
    });

    it('getAlertButtons proxies to /wda/alert/buttons', async function () {
      proxyStub.resolves(['OK']);
      assert.deepStrictEqual(await backend.getAlertButtons(), ['OK']);
      assert.strictEqual(proxyStub.calledOnceWithExactly('/wda/alert/buttons', 'GET'), true);
    });
  });

  describe('find', function () {
    it('findElement delegates to findWebElementOrElements with many=false', async function () {
      const findStub = sandbox.stub(driver, 'findWebElementOrElements').resolves({ELEMENT: 'found'} as any);
      const result = await backend.findElement('id', 'foo', 'ctx-1');
      assert.deepStrictEqual(result, {ELEMENT: 'found'});
      assert.strictEqual(findStub.calledOnceWithExactly('id', 'foo', false, 'ctx-1'), true);
    });

    it('findElements delegates to findWebElementOrElements with many=true', async function () {
      const findStub = sandbox.stub(driver, 'findWebElementOrElements').resolves([]);
      await backend.findElements('id', 'foo');
      assert.strictEqual(findStub.calledOnceWithExactly('id', 'foo', true, undefined), true);
    });
  });
});
