#!/usr/bin/env node
'use strict';

// Stdio shim for the CloudShots MCP server that runs inside CloudShots for Mac.
// Each line on stdin is one JSON-RPC message. It is POSTed to the local server and
// the JSON reply is written back as one line on stdout. Nothing leaves this Mac:
// the only hosts used are cloudshots.local and 127.0.0.1, both on this machine.

const http = require('node:http');
const readline = require('node:readline');

const PORT = 47819;
const HOSTS = ['cloudshots.local', '127.0.0.1'];
const ACCESS_KEY = (process.env.CLOUDSHOTS_ACCESS_KEY || '').trim();

const NOT_RUNNING =
  "CloudShots is not running, or 'Allow AI agents to use your library' is off, or Pro is not active " +
  '(CloudShots for Mac > Settings > AI & integrations).';
const WRONG_KEY =
  'The CloudShots access key is wrong; copy it again from the MCP server card in Settings.';

// getaddrinfo failures: the name does not resolve, so the loopback address is used instead.
const NAME_NOT_FOUND = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'EAI_NONAME']);

// Index into HOSTS. Moves to the loopback address after a failed name lookup and stays there
// for the life of this process.
let hostIndex = 0;

function log(text) {
  process.stderr.write(`[cloudshots] ${text}\n`);
}

function post(host, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host,
        // The server binds IPv4 loopback only; an AAAA lookup of the local-only name would wait seconds.
        family: 4,
        port: PORT,
        path: '/mcp',
        method: 'POST',
        agent: false,
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
    request.on('error', reject);
    request.end(body);
  });
}

async function send(body) {
  for (;;) {
    try {
      return await post(HOSTS[hostIndex], body);
    } catch (error) {
      if (NAME_NOT_FOUND.has(error.code) && hostIndex < HOSTS.length - 1) {
        log(`${HOSTS[hostIndex]} does not resolve; using ${HOSTS[hostIndex + 1]}`);
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

// One message at a time, in the order received.
let queue = Promise.resolve();
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (line.trim() === '') return;
  queue = queue.then(() => relay(line)).catch((error) => log(`unexpected error: ${error.code || error.name}`));
});
