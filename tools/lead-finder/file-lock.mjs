import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_STALE_MS = 30000;
const DEFAULT_POLL_MS = 50;

function lockPath(file) {
  const absolute = path.resolve(file);
  return `${absolute}.lock`;
}

async function acquireLock(file, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const target = lockPath(file);
  const startedAt = Date.now();

  await mkdir(path.dirname(target), { recursive: true });

  while (true) {
    try {
      await mkdir(target);
      return async () => {
        await rm(target, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      try {
        const info = await stat(target);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(target, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT") throw statError;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for lock: ${target}`);
      }

      await delay(pollMs);
    }
  }
}

export async function withFileLock(file, callback, options = {}) {
  const release = await acquireLock(file, options);
  try {
    return await callback();
  } finally {
    await release();
  }
}
