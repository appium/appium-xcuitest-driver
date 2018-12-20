/**
 * `mocha-parallel-tests` is broken at the moment, so skipped describe blocks fail
 * the fix is simple, and this patches the error until they fix the package
 **/
const fs = require('fs');
const path = require('path');


const filePath = path.resolve(__dirname, 'node_modules', 'mocha-parallel-tests', 'dist', 'main', 'util.js');

let script = fs.readFileSync(filePath, {encoding: 'utf8'});
script = script.replace(`if (value.type === 'test') {`, `if (value.type === 'test') {\n        delete value.fn;`);
fs.writeFileSync(filePath, script);
