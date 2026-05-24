import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
}));

const manifestPath = path.resolve('assets', 'manifest.json');

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
}

function mockExternalSuccess() {
  mockedExecSync.mockImplementation((cmd: string | Buffer) => {
    const s = typeof cmd === 'string' ? cmd : cmd.toString();
    if (s.startsWith('which') || s.startsWith('where')) return Buffer.from('/usr/bin/openspec');
    if (s.startsWith('openspec init')) return Buffer.from('ok');
    if (s.startsWith('npx skills')) return Buffer.from('installed');
    return Buffer.from('');
  });
}

async function captureJsonOutput(fn: () => Promise<void>): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = vi.fn((...args: unknown[]) => lines.push(String(args[0])));
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return JSON.parse(lines.join('\n'));
}

describe('comet init E2E', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `comet-init-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('installs Comet skills at project scope with --yes --json', async () => {
    mockExternalSuccess();
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

    const { initCommand } = await import('../../src/commands/init.js');
    const result = await captureJsonOutput(() => initCommand(tmpDir, { yes: true, json: true }));

    expect(result.projectPath).toBe(tmpDir);
    expect(result.scope).toBe('project');
    expect(result.language).toBe('en');
    expect(result.selectedPlatforms).toContain('claude');
    expect(result.workingDirsCreated).toBe(true);

    const claudeResult = (result.results as { platform: string; comet: string }[]).find(
      (r) => r.platform === 'claude',
    );
    expect(claudeResult?.comet).toBe('installed');

    const manifest = await readManifest();
    for (const skillPath of manifest.skills) {
      const dest = path.join(tmpDir, '.claude', 'skills', skillPath);
      await expect(fs.access(dest)).resolves.toBeUndefined();
    }

    await expect(fs.stat(path.join(tmpDir, 'docs', 'superpowers', 'specs'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(tmpDir, 'docs', 'superpowers', 'plans'))).resolves.toBeDefined();
  }, 20_000);

  it('installs Comet skills at global scope', async () => {
    mockExternalSuccess();

    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    const fakeHome = path.join(tmpDir, 'fake-home');
    await fs.mkdir(fakeHome, { recursive: true });

    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);

    const { initCommand } = await import('../../src/commands/init.js');
    const result = await captureJsonOutput(() =>
      initCommand(tmpDir, { yes: true, scope: 'global', json: true }),
    );

    expect(result.scope).toBe('global');
    expect(result.workingDirsCreated).toBe(false);

    const manifest = await readManifest();
    for (const skillPath of manifest.skills) {
      const dest = path.join(fakeHome, '.claude', 'skills', skillPath);
      await expect(fs.access(dest)).resolves.toBeUndefined();
    }

    await expect(fs.stat(path.join(tmpDir, 'docs', 'superpowers', 'specs'))).rejects.toThrow();
  }, 20_000);

  it('skips already-installed Comet skills with --yes', async () => {
    mockExternalSuccess();
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

    const { initCommand } = await import('../../src/commands/init.js');
    const result1 = await captureJsonOutput(() => initCommand(tmpDir, { yes: true, json: true }));
    const claude1 = (result1.results as { platform: string; comet: string }[]).find(
      (r) => r.platform === 'claude',
    );
    expect(claude1?.comet).toBe('installed');

    vi.resetModules();
    vi.resetAllMocks();
    mockExternalSuccess();

    const { initCommand: init2 } = await import('../../src/commands/init.js');
    const result2 = await captureJsonOutput(() => init2(tmpDir, { yes: true, json: true }));
    const claude2 = (result2.results as { platform: string; comet: string }[]).find(
      (r) => r.platform === 'claude',
    );
    expect(claude2?.comet).toBe('skipped');
  }, 20_000);

  it('overwrites existing Comet skills with --overwrite', async () => {
    mockExternalSuccess();
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

    const { initCommand } = await import('../../src/commands/init.js');
    await captureJsonOutput(() => initCommand(tmpDir, { yes: true, json: true }));

    vi.resetModules();
    vi.resetAllMocks();
    mockExternalSuccess();

    const { initCommand: init2 } = await import('../../src/commands/init.js');
    const result = await captureJsonOutput(() =>
      init2(tmpDir, { yes: true, overwrite: true, json: true }),
    );
    const claude = (result.results as { platform: string; comet: string }[]).find(
      (r) => r.platform === 'claude',
    );
    expect(claude?.comet).toBe('installed');
  }, 20_000);

  it('handles multiple platforms in a single run', async () => {
    mockExternalSuccess();
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.cursor'), { recursive: true });

    const { initCommand } = await import('../../src/commands/init.js');
    const result = await captureJsonOutput(() => initCommand(tmpDir, { yes: true, json: true }));

    expect(result.selectedPlatforms).toContain('claude');
    expect(result.selectedPlatforms).toContain('cursor');
    expect((result.results as unknown[]).length).toBeGreaterThanOrEqual(2);

    const manifest = await readManifest();
    for (const platform of ['.claude', '.cursor']) {
      for (const skillPath of manifest.skills) {
        const dest = path.join(tmpDir, platform, 'skills', skillPath);
        await expect(fs.access(dest)).resolves.toBeUndefined();
      }
    }
  }, 20_000);
});
