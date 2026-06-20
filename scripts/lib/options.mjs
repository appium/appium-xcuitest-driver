/**
 * @param {string} value
 * @param {string} label
 * @returns {number}
 */
export function parsePositiveIntegerOption(value, label) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`);
  }
  return num;
}
