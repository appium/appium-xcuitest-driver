import _ from 'lodash';

let env;

if (!_.isEmpty(process.env.SAUCE_EMUSIM_CONFIG)) {
  env = require('./env-ios-sim');
}

Object.assign(process.env, env);
export default env;