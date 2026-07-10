import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Checkpoint, EngineAction, TrajectoryEvent } from './types.js';

function resolveRunPath(changeDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error('Run path must stay inside the change directory');
  const root = path.resolve(changeDir);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Run path must stay inside the change directory');
  }
  return target;
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, file);
}

async function readOptionalText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function appendTrajectory(
  changeDir: string,
  relativePath: string,
  event: TrajectoryEvent,
): Promise<void> {
  const file = resolveRunPath(changeDir, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

export async function readTrajectory(
  changeDir: string,
  relativePath: string,
): Promise<TrajectoryEvent[]> {
  const raw = await readOptionalText(resolveRunPath(changeDir, relativePath));
  if (raw === null) return [];
  return raw
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, number }) => {
      try {
        return JSON.parse(line) as TrajectoryEvent;
      } catch (error) {
        throw new Error(`Invalid Trajectory event at line ${number}`, { cause: error });
      }
    });
}

export async function readArtifacts(
  changeDir: string,
  relativePath: string,
): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(resolveRunPath(changeDir, relativePath), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeArtifacts(
  changeDir: string,
  relativePath: string,
  artifacts: Record<string, string>,
): Promise<void> {
  await atomicWrite(
    resolveRunPath(changeDir, relativePath),
    JSON.stringify(artifacts, null, 2) + '\n',
  );
}

export async function writeContext(
  changeDir: string,
  relativePath: string,
  context: string,
): Promise<void> {
  await atomicWrite(resolveRunPath(changeDir, relativePath), context);
}

export async function readContext(changeDir: string, relativePath: string): Promise<string | null> {
  return readOptionalText(resolveRunPath(changeDir, relativePath));
}

export async function writePendingAction(
  changeDir: string,
  relativePath: string,
  action: EngineAction,
): Promise<void> {
  await atomicWrite(
    resolveRunPath(changeDir, relativePath),
    JSON.stringify(action, null, 2) + '\n',
  );
}

export async function readPendingAction(
  changeDir: string,
  relativePath: string,
): Promise<EngineAction | null> {
  try {
    return JSON.parse(await fs.readFile(resolveRunPath(changeDir, relativePath), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function clearPendingAction(changeDir: string, relativePath: string): Promise<void> {
  try {
    await fs.unlink(resolveRunPath(changeDir, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function writeCheckpoint(
  changeDir: string,
  relativePath: string,
  checkpoint: Checkpoint,
): Promise<void> {
  await atomicWrite(
    resolveRunPath(changeDir, relativePath),
    JSON.stringify(checkpoint, null, 2) + '\n',
  );
}

export async function readCheckpoint(
  changeDir: string,
  relativePath: string,
): Promise<Checkpoint | null> {
  const raw = await readOptionalText(resolveRunPath(changeDir, relativePath));
  return raw === null ? null : (JSON.parse(raw) as Checkpoint);
}
