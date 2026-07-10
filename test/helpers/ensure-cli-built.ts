import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function latestMtime(root: string): Promise<number> {
  const stats = await fs.stat(root);
  if (!stats.isDirectory()) return stats.mtimeMs;
  const entries = await fs.readdir(root, { withFileTypes: true });
  const times = await Promise.all(entries.map((entry) => latestMtime(path.join(root, entry.name))));
  return Math.max(stats.mtimeMs, ...times);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const stats = await fs.stat(lockPath);
    if (Date.now() - stats.mtimeMs > 120_000) await fs.rm(lockPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function cliBuildIsFresh(repositoryRoot: string): Promise<boolean> {
  const cliIndex = path.join(repositoryRoot, 'dist', 'app', 'cli', 'index.js');
  if (!(await pathExists(cliIndex))) return false;
  const sourceRoots = ['app', 'domains', 'platform'];
  const sourceMtimes = await Promise.all(
    sourceRoots.map((root) => latestMtime(path.join(repositoryRoot, root))),
  );
  const [distStats, buildStats] = await Promise.all([
    fs.stat(cliIndex),
    fs.stat(path.join(repositoryRoot, 'build.js')),
  ]);
  return distStats.mtimeMs >= Math.max(...sourceMtimes, buildStats.mtimeMs);
}

export async function ensureCliBuilt(repositoryRoot: string): Promise<void> {
  const lockPath = path.join(repositoryRoot, '.comet-test-build.lock');
  while (true) {
    await removeStaleLock(lockPath);
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      handle = await fs.open(lockPath, 'wx');
      if (!(await cliBuildIsFresh(repositoryRoot))) {
        execFileSync(process.execPath, ['build.js'], {
          cwd: repositoryRoot,
          stdio: 'pipe',
        });
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await sleep(100);
    } finally {
      await handle?.close();
      if (handle) await fs.rm(lockPath, { force: true });
    }

    if (await cliBuildIsFresh(repositoryRoot)) return;
  }
}
