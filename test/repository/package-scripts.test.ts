import { promises as fs } from 'fs';
import { describe, expect, it } from 'vitest';

describe('package scripts', () => {
  it('runs the prepublish build without invoking pnpm from the npm lifecycle', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    const prepublishOnly = packageJson.scripts?.prepublishOnly;

    expect(prepublishOnly).toBe('node scripts/release/prepublish-check.js && node build.js');
    expect(prepublishOnly).not.toContain('pnpm');
  });

  it('routes prepare through the release prepare helper', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.prepare).toBe('node scripts/release/prepare.js');
  });
});
