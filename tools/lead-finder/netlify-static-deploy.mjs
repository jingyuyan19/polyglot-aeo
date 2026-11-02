#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_DIR = "polyglotaeo-web/out";
const API_BASE = "https://api.netlify.com/api/v1";
const REQUEST_RETRIES = Number(process.env.NETLIFY_REQUEST_RETRIES || 8);

function usage() {
  return `
Usage:
  pnpm web:deploy:netlify-api

Options:
  --site <id>       Netlify site id. Default: ${DEFAULT_SITE_ID}
  --dir <dir>       Static directory to deploy. Default: ${DEFAULT_DIR}
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE_ID,
    dir: DEFAULT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--dir") {
      args.dir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function listFiles(root) {
  const files = [];

  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(root);
  return files.sort();
}

function deployPath(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  return `/${relative}`;
}

async function sha1(file) {
  const buffer = await readFile(file);
  return createHash("sha1").update(buffer).digest("hex");
}

async function buildManifest(root) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await stat(absoluteRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`Deploy dir is not a directory: ${root}`);
  }

  const files = await listFiles(absoluteRoot);
  const manifest = {};
  const byHash = new Map();
  const byPath = new Map();

  for (const file of files) {
    const urlPath = deployPath(absoluteRoot, file);
    const hash = await sha1(file);
    manifest[urlPath] = hash;
    byHash.set(hash, { file, path: urlPath, hash });
    byPath.set(urlPath, { file, path: urlPath, hash });
  }

  return { root: absoluteRoot, files, manifest, byHash, byPath };
}

async function authToken() {
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  if (token) return token;

  const configPaths = [
    path.join(os.homedir(), "Library/Preferences/netlify/config.json"),
    path.join(os.homedir(), ".netlify", "config.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      const configToken = config?.users?.[config.userId]?.auth?.token || config?.auth?.token || config?.token || "";
      if (configToken) return configToken;
    } catch {
      // Try the next known Netlify CLI config location.
    }
  }

  throw new Error("Netlify token not found. Run netlify login or set NETLIFY_AUTH_TOKEN.");
}

async function netlifyJson({ method = "GET", url, token, body }) {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const response = await netlifyRequest({
    method,
    url,
    token,
    body: payload,
    headers: {
      "Content-Type": "application/json",
    },
  });

  return JSON.parse(response.toString("utf8"));
}

async function netlifyUpload({ url, token, file }) {
  const payload = await readFile(file);
  await netlifyRequest({
    method: "PUT",
    url,
    token,
    body: payload,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });
}

async function netlifyRequest({ method, url, token, body, headers = {} }) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      return await requestOnce({ method, url, token, body, headers });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === REQUEST_RETRIES) break;
      const delay = 1000 * attempt;
      process.stderr.write(`Netlify request retry ${attempt}/${REQUEST_RETRIES - 1}: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function requestOnce({ method, url, token, body, headers }) {
  const target = new URL(url);
  const payload = body || Buffer.alloc(0);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method,
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        port: target.port || 443,
        protocol: target.protocol,
        agent: false,
        timeout: 60000,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Length": payload.byteLength,
          Connection: "close",
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(buffer);
            return;
          }

          const bodyPreview = buffer.toString("utf8").slice(0, 500);
          const error = new Error(`Netlify API ${method} ${target.pathname} failed: HTTP ${response.statusCode} ${bodyPreview}`);
          error.statusCode = response.statusCode;
          reject(error);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Netlify API ${method} ${target.pathname} timed out`));
    });
    request.on("error", reject);
    if (payload.byteLength) request.write(payload);
    request.end();
  });
}

function isRetryable(error) {
  if (error.statusCode && error.statusCode >= 500) return true;
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(error.code) || /timed out|socket hang up|ECONNRESET/i.test(error.message);
}

function uploadPath(deployPathValue) {
  return deployPathValue
    .split("/")
    .map((part, index) => (index === 0 ? "" : encodeURIComponent(part)))
    .join("/");
}

function requiredFiles(required, manifest) {
  const items = Array.isArray(required) ? required : [];
  const files = [];

  for (const item of items) {
    if (typeof item !== "string") continue;
    const byPath = manifest.byPath.get(item.startsWith("/") ? item : `/${item}`);
    if (byPath) {
      files.push(byPath);
      continue;
    }
    const byHash = manifest.byHash.get(item);
    if (byHash) {
      files.push(byHash);
    }
  }

  return files;
}

async function pollDeploy({ deployId, token }) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const deploy = await netlifyJson({
      url: `${API_BASE}/deploys/${deployId}`,
      token,
    });
    if (["ready", "uploaded", "current"].includes(deploy.state)) {
      return deploy;
    }
    if (["error", "failed"].includes(deploy.state)) {
      throw new Error(`Deploy failed with state ${deploy.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Timed out waiting for Netlify deploy to become ready.");
}

async function deploy(args) {
  const token = await authToken();
  const manifest = await buildManifest(args.dir);

  process.stdout.write(`Deploy dir: ${manifest.root}\n`);
  process.stdout.write(`Files in manifest: ${manifest.files.length}\n`);

  const create = await netlifyJson({
    method: "POST",
    url: `${API_BASE}/sites/${args.site}/deploys`,
    token,
    body: { files: manifest.manifest },
  });

  const deployId = create.id;
  if (!deployId) {
    throw new Error(`Netlify did not return a deploy id: ${JSON.stringify(create).slice(0, 500)}`);
  }

  const required = requiredFiles(create.required, manifest);
  process.stdout.write(`Deploy id: ${deployId}\n`);
  process.stdout.write(`Files required by Netlify: ${required.length}\n`);

  for (const item of required) {
    process.stdout.write(`Uploading ${item.path}\n`);
    await netlifyUpload({
      url: `${API_BASE}/deploys/${deployId}/files${uploadPath(item.path)}`,
      token,
      file: item.file,
    });
  }

  const finalDeploy = await pollDeploy({ deployId, token });
  process.stdout.write(`Deploy state: ${finalDeploy.state || create.state || "unknown"}\n`);
  process.stdout.write(`Deploy URL: ${finalDeploy.deploy_ssl_url || finalDeploy.ssl_url || finalDeploy.url || create.deploy_ssl_url || create.url}\n`);
  process.stdout.write(`Admin URL: ${finalDeploy.admin_url || create.admin_url || ""}\n`);

  return finalDeploy;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  await deploy(args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
