import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('codegraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comet-codegraph-'));
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects an existing project CodeGraph index', async () => {
    const codegraphDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(codegraphDir, { recursive: true });
    fs.writeFileSync(path.join(codegraphDir, '.gitignore'), '*\n!.gitignore\n');

    const { hasCodegraphProjectIndex } = await import('../../src/core/codegraph.js');

    expect(hasCodegraphProjectIndex(tmpDir)).toBe(false);

    fs.writeFileSync(path.join(codegraphDir, 'codegraph.db'), '');

    expect(hasCodegraphProjectIndex(tmpDir)).toBe(true);
  });

  it('skips install when a project CodeGraph index already exists', async () => {
    const codegraphDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(codegraphDir, { recursive: true });
    fs.writeFileSync(path.join(codegraphDir, 'codegraph.db'), '');

    const { installCodegraph } = await import('../../src/core/codegraph.js');
    const result = await installCodegraph(tmpDir, 'project');

    expect(result).toBe('skipped');
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('uses a pnpm global CodeGraph binary instead of reinstalling with npm', async () => {
    const pnpmBinDir = path.join(tmpDir, 'pnpm-bin');
    fs.mkdirSync(pnpmBinDir, { recursive: true });
    const shimName = process.platform === 'win32' ? 'codegraph.cmd' : 'codegraph';
    const shimPath = path.join(pnpmBinDir, shimName);
    fs.writeFileSync(shimPath, '');

    mockedExecFileSync.mockImplementation((command: unknown, args?: unknown) => {
      const cmd = String(command);
      const cmdArgs = Array.isArray(args) ? args.map(String) : [];
      if ((cmd === 'where' || cmd === 'which') && cmdArgs[0] === 'codegraph') {
        throw new Error('not on PATH');
      }
      if ((cmd === 'pnpm' || cmd === 'pnpm.cmd') && cmdArgs.join(' ') === 'bin -g') {
        return `${pnpmBinDir}\n`;
      }
      return Buffer.from('ok');
    });

    const { installCodegraph } = await import('../../src/core/codegraph.js');
    const result = await installCodegraph(tmpDir, 'project');

    expect(result).toBe('installed');
    expect(mockedExecFileSync.mock.calls).not.toContainEqual(
      expect.arrayContaining([
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '-g', '@colbymchenry/codegraph'],
      ]),
    );
    expect(mockedExecFileSync.mock.calls).toContainEqual(
      expect.arrayContaining([shimPath, ['install', '--yes']]),
    );
  });
});
