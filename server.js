#!/usr/bin/env node
'use strict';

// Stdio shim for the CloudShots MCP server that runs inside CloudShots for Mac.
// Each line on stdin is one JSON-RPC message. It is POSTed to the local server and
// the JSON reply is written back as one line on stdout. Nothing leaves this Mac:
// requests go to cloudshots.local only when that name resolves to a loopback address
// (127.0.0.0/8), otherwise to 127.0.0.1. The access key is never sent anywhere else.

const dns = require('node:dns');
const http = require('node:http');
const readline = require('node:readline');

const PORT = 47819;
const HOSTS = ['cloudshots.local', '127.0.0.1'];
const TIMEOUT_MS = 120000; // take_screenshot can wait on the user
const ACCESS_KEY = (process.env.CLOUDSHOTS_ACCESS_KEY || '').trim();

const NOT_RUNNING =
  "CloudShots is not running, or 'Allow AI agents to use your library' is off, or Pro is not active " +
  '(CloudShots for Mac > Settings > AI & integrations).';
const WRONG_KEY =
  'The CloudShots access key is wrong; copy it again from the MCP server card in Settings.';
const TIMED_OUT = 'CloudShots did not answer in time.';

// The name does not resolve, or resolves outside this Mac: the loopback address is used instead.
const NOT_USABLE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'EAI_NONAME', 'ENOTLOOPBACK']);

// Index into HOSTS. Moves to the loopback address after a failed or non-loopback lookup and
// stays there for the life of this process.
let hostIndex = 0;

function log(text) {
  process.stderr.write(`[cloudshots] ${text}\n`);
}

// Resolves a name to an IPv4 loopback address only. The server binds IPv4 loopback, so no
// AAAA query is made (it would wait seconds for a local-only name), and an answer from another
// machine on the network is refused so the access key never leaves this Mac.
function loopbackLookup(hostname, options, callback) {
  dns.lookup(hostname, { family: 4 }, (error, address) => {
    if (error) return callback(error);
    if (!address.startsWith('127.')) {
      return callback(Object.assign(new Error('not a loopback address'), { code: 'ENOTLOOPBACK' }));
    }
    return options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4);
  });
}

function post(host, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host,
        port: PORT,
        path: '/mcp',
        method: 'POST',
        agent: false,
        lookup: loopbackLookup,
        headers: {
          Host: `${host}:${PORT}`,
          Authorization: `Bearer ${ACCESS_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
        );
        response.on('error', reject);
      },
    );
    request.setTimeout(TIMEOUT_MS, () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    request.on('error', reject);
    request.end(body);
  });
}

async function send(body) {
  for (;;) {
    try {
      return await post(HOSTS[hostIndex], body);
    } catch (error) {
      if (NOT_USABLE.has(error.code) && hostIndex < HOSTS.length - 1) {
        const reason = error.code === 'ENOTLOOPBACK' ? 'does not resolve to this Mac' : 'does not resolve';
        log(`${HOSTS[hostIndex]} ${reason}; using ${HOSTS[hostIndex + 1]}`);
        hostIndex += 1;
        continue;
      }
      throw error;
    }
  }
}

function reply(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

// A message that expects an answer has both a method and an id.
function parseRequest(line) {
  try {
    const message = JSON.parse(line);
    const isRequest =
      message && typeof message.method === 'string' && message.id !== undefined && message.id !== null;
    return isRequest ? { id: message.id } : null;
  } catch {
    return null;
  }
}

function fail(request, text) {
  if (request) {
    reply({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: text } });
  } else {
    log(text);
  }
}

function describe(error) {
  if (error.code === 'ECONNREFUSED') return NOT_RUNNING;
  if (error.code === 'ETIMEDOUT') return TIMED_OUT;
  return `Could not reach CloudShots (${error.code || 'network error'}). ${NOT_RUNNING}`;
}

async function relay(line) {
  const request = parseRequest(line);
  if (!ACCESS_KEY) return fail(request, WRONG_KEY);

  let answer;
  try {
    answer = await send(line);
  } catch (error) {
    return fail(request, describe(error));
  }

  if (answer.status === 401) return fail(request, WRONG_KEY);
  if (answer.status === 202 || (answer.status === 200 && answer.body.trim() === '')) return;
  if (answer.status !== 200) {
    return fail(request, `CloudShots answered HTTP ${answer.status}: ${answer.body.slice(0, 500)}`);
  }

  try {
    reply(JSON.parse(answer.body));
  } catch {
    fail(request, 'CloudShots answered HTTP 200 with a body that is not JSON.');
  }
}

if (!ACCESS_KEY) log('CLOUDSHOTS_ACCESS_KEY is not set; every request will be answered with a key error.');

process.on('uncaughtException', (error) => log(`unexpected error: ${error.code || error.name}`));
process.stdout.on('error', () => process.exit(0));

// One message at a time, in the order received. When Claude closes stdin, exit once the queue settles.
let queue = Promise.resolve();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (line.trim() === '') return;
  queue = queue.then(() => relay(line)).catch((error) => log(`unexpected error: ${error.code || error.name}`));
});
input.on('close', () => queue.then(() => process.stdout.write('', () => process.exit(0))));
