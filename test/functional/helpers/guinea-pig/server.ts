import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {URL} from 'node:url';

import {sleep} from 'asyncbox';

import {FIXTURES_ROOT as GLOBAL_FIXTURES_ROOT} from '../../../setup';
import {getFreePort} from '../ports';
import {compileLodashTemplate} from './template';

const FIXTURES_ROOT = path.join(GLOBAL_FIXTURES_ROOT, 'guinea-pig');
const DYNAMIC_ROUTES: Record<string, string> = {
  '/test/guinea-pig': 'guinea-pig.html',
  '/test/guinea-pig-scrollable': 'guinea-pig-scrollable.html',
  '/test/guinea-pig-app-banner': 'guinea-pig-app-banner.html',
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export type GuineaPigServer = {
  host: string;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

type TemplateParams = Record<string, unknown>;

export async function startGuineaPigServer(opts?: {host?: string}): Promise<GuineaPigServer> {
  const host = opts?.host ?? '127.0.0.1';
  const port = Number(await getFreePort());

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);
      const dynamicPage = DYNAMIC_ROUTES[url.pathname];
      if (dynamicPage) {
        await handleGuineaPigTemplate(req, res, dynamicPage, url);
        return;
      }

      if (await serveStatic(url.pathname, res)) {
        return;
      }

      res.statusCode = 404;
      res.end('Not Found');
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const baseUrl = `http://${host}:${port}`;
  return {
    host,
    port,
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString();
}

function parseFormBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    result[key] = value;
  }
  return result;
}

function setGuineaPigCookies(res: http.ServerResponse): void {
  res.setHeader('Set-Cookie', [
    `guineacookie1=${encodeURIComponent('i am a cookie value')}; Path=/`,
    `guineacookie2=${encodeURIComponent('cookié2')}; Path=/`,
    `guineacookie3=${encodeURIComponent('cant access this')}; Domain=.blargimarg.com; Path=/`,
  ]);
}

async function getTemplate(templateName: string): Promise<(params: TemplateParams) => string> {
  const content = await fs.readFile(path.join(FIXTURES_ROOT, 'test', templateName), 'utf8');
  return compileLodashTemplate(content);
}

async function handleGuineaPigTemplate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  page: string,
  url: URL,
): Promise<void> {
  const delay = parseInt(String(url.searchParams.get('delay') ?? 0), 10);
  const throwError = String(url.searchParams.get('throwError') ?? '');
  const params: TemplateParams = {
    throwError,
    serverTime: new Date(),
    userAgent: req.headers['user-agent'],
    comment: 'None',
  };

  if (req.method === 'POST') {
    const body = await readBody(req);
    const parsed = parseFormBody(body);
    if (parsed.comments) {
      params.comment = parsed.comments;
    }
  }

  if (delay) {
    await sleep(delay);
  }

  const template = await getTemplate(page);
  res.setHeader('Content-Type', 'text/html');
  setGuineaPigCookies(res);
  res.end(template(params));
}

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<boolean> {
  const filePath = path.resolve(FIXTURES_ROOT, `.${pathname}`);
  const relative = path.relative(FIXTURES_ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
