'use strict';

module.exports = (wallaby) => {
  return {
    compilers: {
      '**/*.js': wallaby.compilers.typeScript({
        allowJs: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        isolatedModules: true,
      }),
      '**/*.ts?(x)': wallaby.compilers.typeScript(),
    },
    debug: true,
    env: {
      type: 'node',
    },
    files: [
      'package.json',
      'lib/**/*',
      'test/unit/helpers.js',
    ],
    testFramework: 'mocha',
    tests: ['test/unit/**/*-specs.js'],
    workers: {
      // restart: true,
    },
    setup(wallaby) {
      // copied out of `./test/setup.js`

      const chai = require('chai');
      const chaiAsPromised = require('chai-as-promised');

      // The `chai` global is set if a test needs something special.
      // Most tests won't need this.
      global.chai = chai.use(chaiAsPromised);

      // `should()` is only necessary when working with some `null` or `undefined` values.
      global.should = chai.should();

      const mocha = wallaby.testFramework;
      mocha.timeout(10000);
    },
    runMode: 'onsave',
  };
};
