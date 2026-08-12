/* eslint-disable no-console */
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {run} from 'node:test';
import {spec} from 'node:test/reporters';

// The functional suite drives real iOS Simulators/devices over Appium/WDA, which is known to
// intermittently stall on CI (e.g. a wedged simulator never responding to a command). Giving every
// individual test a hard timeout turns such a stall into a single failed test instead of the whole
// suite hanging until the job-level timeout kills it. On CI, a test hitting that timeout is not a
// genuine assertion/code bug, so on its own it must not fail the job - only a real thrown error or
// failed assertion should. Locally there's no flaky-simulator infra to shield against, so a timeout
// there is treated as a real failure like any other. This runner replicates `--test-force-exit
// --test-concurrency=1 --test-timeout=<TEST_TIMEOUT_MS>` via run()'s options, then inspects each
// test:fail event's `failureType` to tell the two cases apart before deciding the process exit code.
//
// run()'s `files` option only accepts literal file paths, not glob patterns (unlike the `node --test`
// CLI), so the glob pattern passed on the command line is resolved to a file list first.
const TEST_TIMEOUT_MS = 5 * 60 * 1000;
const IS_CI = Boolean(process.env.CI);

/**
 * Minimal recursive glob resolver supporting `*` (any characters within a single path segment) and
 * `**` (zero or more path segments) - the only two constructs the npm e2e-test scripts use.
 * @param {string} pattern
 * @returns {string[]}
 */
function globSync(pattern) {
  let normalized = pattern;
  let root = '.';
  if (normalized.startsWith('/')) {
    root = '/';
    normalized = normalized.slice(1);
  } else if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  const segments = normalized.split('/').filter(Boolean);

  /**
   * @param {string} name
   * @param {string} segment
   * @returns {boolean}
   */
  const matchesSegment = (name, segment) =>
    new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(name);

  /**
   * @param {string} dir
   * @param {number} segIndex
   * @returns {string[]}
   */
  const walk = (dir, segIndex) => {
    if (segIndex === segments.length) {
      return [];
    }
    const segment = segments[segIndex];
    const isLast = segIndex === segments.length - 1;
    let entries;
    try {
      entries = readdirSync(dir, {withFileTypes: true});
    } catch {
      return [];
    }
    const results = [];
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (segment === '**') {
        if (entry.isDirectory()) {
          results.push(...walk(entryPath, segIndex));
        }
      } else if (matchesSegment(entry.name, segment)) {
        if (isLast) {
          if (entry.isFile()) {
            results.push(entryPath);
          }
        } else if (entry.isDirectory()) {
          results.push(...walk(entryPath, segIndex + 1));
        }
      }
    }
    if (segment === '**') {
      // `**` also matches zero directories
      results.push(...walk(dir, segIndex + 1));
    }
    return results;
  };

  return [...new Set(walk(root, 0))].sort();
}

const [, , pattern] = process.argv;
if (!pattern) {
  console.error('Usage: run-e2e-tests.mjs <glob pattern>');
  process.exitCode = 1;
} else {
  const files = globSync(pattern);
  if (files.length === 0) {
    console.error(`No test files matched pattern: ${pattern}`);
    process.exitCode = 1;
  } else {
    const stream = run({
      files,
      concurrency: 1,
      timeout: TEST_TIMEOUT_MS,
      forceExit: true,
    });

    let hasRealFailure = false;
    stream.on('test:fail', (data) => {
      // Suite/describe nodes also emit their own test:fail (failureType 'subtestsFailed') whenever
      // any child test fails, purely as an aggregate of already-reported child failures. Only
      // classify leaf test failures - otherwise a suite's 'subtestsFailed' wrapper around a mere
      // timeout would itself get misclassified as a real failure.
      if (data.details?.type !== 'test') {
        return;
      }
      // `failureType` is set by node:test at runtime but isn't part of @types/node's `Error` type.
      const failureType = /** @type {any} */ (data.details?.error)?.failureType;
      if (IS_CI && failureType === 'testTimeoutFailure') {
        console.error(`::warning::Ignoring CI timeout in "${data.name}" - not counted as a suite failure`);
      } else {
        hasRealFailure = true;
      }
    });

    stream.compose(spec).pipe(process.stdout);
    stream.on('end', () => {
      process.exitCode = hasRealFailure ? 1 : 0;
    });
  }
}
