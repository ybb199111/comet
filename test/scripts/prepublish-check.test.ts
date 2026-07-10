import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const temporary: string[] = [];
const prepublishCheck = path.resolve('scripts/release/prepublish-check.js');

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf-8');
}

async function makePackageFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-prepublish-check-'));
  temporary.push(root);

  await writeFile(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'comet-prepublish-check-fixture',
        version: '1.0.0',
        files: ['index.js', 'README.md'],
      },
      null,
      2,
    ),
  );
  await writeFile(root, 'README.md', '# Fixture\n');
  await writeFile(root, 'index.js', 'export const ok = true;\n');
  await writeFile(root, '.gitignore', ['eval/.cache/', 'eval/.pytest-basetemp-*/', ''].join('\n'));

  return root;
}

describe('prepublish security check', () => {
  it('scans only files that npm would publish', async () => {
    const root = await makePackageFixture();
    await writeFile(
      root,
      'eval/.cache/langsmith-cc-plugin/src/langsmith.test.ts',
      'const api_key = "abcdefghijklmnopqrstuvwxyz";\n',
    );
    await writeFile(
      root,
      'eval/.pytest-basetemp-ci-green/token.txt',
      'const api_key = "abcdefghijklmnopqrstuvwxyz";\n',
    );

    const result = spawnSync(process.execPath, [prepublishCheck], {
      cwd: root,
      encoding: 'utf-8',
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).not.toContain('[SECURITY]');
  });
});
