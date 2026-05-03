import {isIPv6} from 'node:net';
import {fs, net, util} from 'appium/support';
import {asyncfilter} from 'asyncbox';
import _ from 'lodash';
import {exec} from 'teen_process';
import type {HTTPHeaders} from '@appium/types';
import {log} from '../logger';

export type UploadOptions = {
  /** The name of the user for remote authentication (only when `remotePath` is provided). */
  user?: string;
  /** The password for remote authentication (only when `remotePath` is provided). */
  pass?: string;
  /** Multipart upload HTTP method. Defaults to `PUT`. */
  method?: net.HttpUploadOptions['method'];
  /** Additional headers mapping for multipart HTTP(S) uploads. */
  headers?: HTTPHeaders;
  /** The form field name that receives the file blob in multipart uploads. */
  fileFieldName?: string;
  /** Additional form fields for multipart HTTP(S) uploads. */
  formFields?: Record<string, any> | [string, any][];
};

/**
 * Get the IDs of processes listening on the particular system port.
 * It is also possible to apply additional filtering based on the
 * process command line.
 */
export async function getPIDsListeningOnPort(
  port: string | number,
  filteringFunc: ((cmdLine: string) => boolean | Promise<boolean>) | null = null,
): Promise<string[]> {
  const result: string[] = [];
  try {
    // This only works since Mac OS X El Capitan
    const {stdout} = await exec('lsof', ['-ti', `tcp:${port}`]);
    result.push(...stdout.trim().split(/\n+/));
  } catch {
    return result;
  }

  if (!_.isFunction(filteringFunc)) {
    return result;
  }
  return await asyncfilter(result, async (x) => {
    const {stdout} = await exec('ps', ['-p', x, '-o', 'command']);
    return await filteringFunc(stdout);
  });
}

/**
 * Encodes the given local file to base64 and returns the resulting string
 * or uploads it to a remote server using http/https or ftp protocols
 * if `remotePath` is set
 */
export async function encodeBase64OrUpload(
  localPath: string,
  remotePath: string | null = null,
  uploadOptions: UploadOptions = {},
): Promise<string> {
  if (!(await fs.exists(localPath))) {
    throw log.errorWithException(`The file at '${localPath}' does not exist or is not accessible`);
  }

  if (_.isEmpty(remotePath)) {
    const {size} = await fs.stat(localPath);
    log.debug(`The size of the file is ${util.toReadableSizeString(size)}`);
    return (await util.toInMemoryBase64(localPath)).toString();
  }

  const {user, pass, method, headers, fileFieldName, formFields} = uploadOptions;
  const options: net.HttpUploadOptions & net.NetOptions = {
    method: method ?? 'PUT',
    headers,
    fileFieldName,
    formFields,
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  await net.uploadFile(localPath, remotePath as string, options);
  return '';
}

const LOCALHOST_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  // IPv6 loopback in the form WHATWG URL uses in `hostname` (no `[`/`]` delimiters), e.g. `::1`,
  // and IPv4-mapped 127.0.0.1 as serialized by the URL parser (e.g. `::ffff:7f00:1`).
  '::1',
  '::ffff:7f00:1',
];

/** Returns true if the given URL host resolves to localhost. */
export function isLocalHost(urlString: string): boolean {
  const hostname = canonicalHostnameForLocalhost(urlString);
  return Boolean(hostname && LOCALHOST_HOSTNAMES.includes(hostname));
}

/**
 * `URL#hostname` for IPv6 may be unbracketed (`::1`) or bracketed (`[::1]`) depending on the
 * runtime. If the host is bracketed and the inner value is IPv6, strip brackets so we can compare
 * against unbracketed literals in {@link LOCALHOST_HOSTNAMES}.
 */
function canonicalHostnameForLocalhost(urlString: string): string | null {
  try {
    const {hostname} = new URL(urlString);
    if (hostname.startsWith('[') && hostname.endsWith(']') && hostname.length > 2) {
      const inner = hostname.slice(1, -1);
      if (isIPv6(inner)) {
        return inner;
      }
    }
    return hostname;
  } catch {
    return null;
  }
}
