import fs from 'node:fs/promises';
import path from 'node:path';
import {expect} from 'chai';
import ts from 'typescript';

const HELPERS_DIR = path.resolve(__dirname, '../../lib/commands/helpers');
const UTILS_DIR = path.resolve(__dirname, '../../lib/utils');

const HELPERS_FORBIDDEN_SPECS = new Set([
  './index',
  './helpers',
  '../helpers',
  '../driver',
  '../../driver',
]);

const LIB_DIR = path.resolve(__dirname, '../../lib');
const UTILS_SUBMODULE_IMPORT_RE = /from\s+['"](?:\.\.\/)*utils\/(?:lang|memoize)['"]/;

const UTILS_FORBIDDEN_SPECS = new Set([
  './index',
  './lang',
  './memoize',
  '../utils',
  '../../utils',
]);

async function parseTsFile(file: string): Promise<ts.SourceFile> {
  const content = await fs.readFile(file, 'utf8');
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function moduleSpecifierText(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
  const specifier = node.moduleSpecifier;
  return specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

/** Collects relative module specifiers from static import/export declarations. */
function collectRelativeModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specs: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const text = moduleSpecifierText(node);
      if (text?.startsWith('.')) {
        specs.push(text);
      }
    } else if (ts.isImportEqualsDeclaration(node) && node.moduleReference) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const {expression} = node.moduleReference;
        if (ts.isStringLiteral(expression) && expression.text.startsWith('.')) {
          specs.push(expression.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specs;
}

async function listTsFiles(dir: string, {excludeIndex = false} = {}): Promise<string[]> {
  const names = await fs.readdir(dir);
  return names
    .filter((name) => name.endsWith('.ts') && (!excludeIndex || name !== 'index.ts'))
    .map((name) => path.join(dir, name));
}

async function resolveRelativeTsModule(fromFile: string, spec: string): Promise<string | null> {
  const resolved = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [resolved, `${resolved}.ts`, path.join(resolved, 'index.ts')]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function buildIntraDirGraph(files: string[]): Promise<Map<string, string[]>> {
  const inDir = new Set(files.map((file) => path.resolve(file)));
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const absFile = path.resolve(file);
    const sourceFile = await parseTsFile(absFile);
    const deps: string[] = [];
    for (const spec of collectRelativeModuleSpecifiers(sourceFile)) {
      const resolved = await resolveRelativeTsModule(absFile, spec);
      if (resolved && inDir.has(path.resolve(resolved))) {
        deps.push(path.resolve(resolved));
      }
    }
    graph.set(absFile, deps);
  }
  return graph;
}

function findCycles(graph: Map<string, string[]>, rootDir: string): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const rel = (absPath: string) => path.relative(rootDir, absPath);

  function dfs(node: string): void {
    if (onStack.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node].map(rel));
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    onStack.add(node);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      dfs(dep);
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }
  return cycles;
}

async function assertNoForbiddenImports(
  dir: string,
  forbiddenSpecs: Set<string>,
  {excludeIndex = true} = {},
): Promise<void> {
  const files = await listTsFiles(dir, {excludeIndex});
  for (const file of files) {
    const sourceFile = await parseTsFile(file);
    const basename = path.basename(file);
    for (const spec of collectRelativeModuleSpecifiers(sourceFile)) {
      expect(forbiddenSpecs.has(spec), `${basename} must not import '${spec}'`).to.be.false;
    }
  }
}

async function assertNoCycles(dir: string): Promise<void> {
  const files = await listTsFiles(dir, {excludeIndex: false});
  const graph = await buildIntraDirGraph(files);
  const cycles = findCycles(graph, dir);
  expect(
    cycles,
    `cyclic imports in ${path.relative(process.cwd(), dir)}: ${JSON.stringify(cycles)}`,
  ).to.be.empty;
}

async function listLibTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listLibTsFiles(fullPath)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isUtilsInternalModule(file: string): boolean {
  const rel = path.relative(UTILS_DIR, file);
  return !rel.startsWith('..') && rel !== 'index.ts';
}

async function assertLibImportsUtilsBarrelOnly(): Promise<void> {
  const files = await listLibTsFiles(LIB_DIR);
  for (const file of files) {
    if (isUtilsInternalModule(file)) {
      continue;
    }
    const content = await fs.readFile(file, 'utf8');
    expect(
      UTILS_SUBMODULE_IMPORT_RE.test(content),
      `${path.relative(LIB_DIR, file)} must import from the utils barrel, not utils/lang or utils/memoize`,
    ).to.be.false;
  }
}

describe('module dependency graphs', function () {
  describe('lib', function () {
    it('must import utils via the barrel, not utils submodules', async function () {
      await assertLibImportsUtilsBarrelOnly();
    });
  });

  describe('commands/helpers', function () {
    it('helper modules must not import the barrel or driver', async function () {
      await assertNoForbiddenImports(HELPERS_DIR, HELPERS_FORBIDDEN_SPECS);
    });

    it('must not have cyclic relative imports', async function () {
      await assertNoCycles(HELPERS_DIR);
    });
  });

  describe('utils', function () {
    it('utils modules must not import the barrel or sibling domains', async function () {
      await assertNoForbiddenImports(UTILS_DIR, UTILS_FORBIDDEN_SPECS);
    });

    it('must not have cyclic relative imports', async function () {
      await assertNoCycles(UTILS_DIR);
    });
  });
});
