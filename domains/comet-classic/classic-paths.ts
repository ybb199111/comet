import { promises as fs } from 'fs';
import path from 'path';

export interface ClassicChangeDirectory {
  label: string;
  directory: string;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function filesystemPath(relativePath: string): string {
  return path.resolve(...relativePath.split('/'));
}

export function openSpecChangeNameError(name: string | undefined): string | null {
  if (!name) return 'Change name cannot be empty';
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name)) {
    return `Invalid change name: '${name}'\nValid format: lowercase kebab-case (a-z, 0-9, single hyphens)`;
  }
  if (name.includes('..')) return "Change name cannot contain '..' (path traversal not allowed)";
  return null;
}

export function assertOpenSpecChangeName(name: string | undefined): asserts name is string {
  const error = openSpecChangeNameError(name);
  if (error) throw new Error(error);
}

export async function resolveClassicChangeDirectory(name: string): Promise<ClassicChangeDirectory> {
  const active = `openspec/changes/${name}`;
  if (await exists(filesystemPath(active))) {
    return { label: active, directory: filesystemPath(active) };
  }

  const archiveRoot = 'openspec/changes/archive';
  const exactArchive = `${archiveRoot}/${name}`;
  if (await exists(filesystemPath(exactArchive))) {
    return { label: exactArchive, directory: filesystemPath(exactArchive) };
  }

  if (await exists(filesystemPath(archiveRoot))) {
    const matches: string[] = [];
    for (const entry of await fs.readdir(filesystemPath(archiveRoot), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(`-${name}`)) continue;
      const candidate = `${archiveRoot}/${entry.name}`;
      if (await exists(path.join(filesystemPath(candidate), '.comet.yaml'))) {
        matches.push(candidate);
      }
    }
    const latest = matches.sort((left, right) => right.localeCompare(left))[0];
    if (latest) return { label: latest, directory: filesystemPath(latest) };
  }

  // Fallback: return the active path even if the change doesn't exist in active or archive.
  // This is intentional — matches 0.3.9 behavior where downstream commands report
  // "not found" errors with the expected path, rather than failing silently here.
  return { label: active, directory: filesystemPath(active) };
}
