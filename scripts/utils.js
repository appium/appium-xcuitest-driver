/**
 * Get the value of the given argument name.
 *
 * @param {string} argName
 * @returns {string?} The value of the given 'argName'.
 */
export function parseArgValue(argName) {
  const argNamePattern = new RegExp(`^--${argName}\\b`);
  for (let i = 1; i < process.argv.length; ++i) {
    const arg = process.argv[i];
    if (argNamePattern.test(arg)) {
      return arg.includes('=') ? arg.split('=')[1] : process.argv[i + 1];
    }
  }
  return null;
}
