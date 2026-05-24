import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe('openspec', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isCommandAvailable', () => {
    it('returns true when command is on PATH', async () => {
      mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/node'));
      const { isCommandAvailable } = await import('../../src/core/openspec.js');
      expect(isCommandAvailable('node')).toBe(true);
    });

    it('returns false when command throws', async () => {
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      const { isCommandAvailable } = await import('../../src/core/openspec.js');
      expect(isCommandAvailable('missing-cmd')).toBe(false);
    });
  });

  describe('quoteShellArg', () => {
    it('doubles trailing backslashes before the closing quote on Windows', async () => {
      const { quoteShellArg } = await import('../../src/core/openspec.js');

      expect(quoteShellArg('C:\\Users\\', 'win32')).toBe('"C:\\Users\\\\"');
    });
  });

  describe('installOpenSpec', () => {
    it('installs openspec when CLI is available', async () => {
      mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/openspec'));
      mockedExecSync.mockReturnValueOnce(Buffer.from('ok'));

      const { installOpenSpec } = await import('../../src/core/openspec.js');
      const result = await installOpenSpec('/tmp/test', ['claude', 'cursor'], 'project');

      expect(result).toBe('installed');
      expect(mockedExecSync).toHaveBeenCalledTimes(2);
    });

    it('returns failed when openspec CLI is not available', async () => {
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      // The npm install call
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('npm failed');
      });

      const { installOpenSpec } = await import('../../src/core/openspec.js');
      const result = await installOpenSpec('/tmp/test', ['claude'], 'project');

      expect(result).toBe('failed');
    });

    it('does not pass unsupported --global flag for global scope', async () => {
      mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/openspec'));
      mockedExecSync.mockReturnValueOnce(Buffer.from('ok'));

      const { installOpenSpec, quoteShellArg } = await import('../../src/core/openspec.js');
      await installOpenSpec('/tmp/test', ['claude'], 'global');

      const initCall = mockedExecSync.mock.calls[1][0] as string;
      expect(initCall).not.toContain('--global');
      expect(initCall).toContain(`--tools ${quoteShellArg('claude')}`);
    });

    it('uses the home directory as the OpenSpec init target for global scope', async () => {
      const { buildOpenSpecInitCommand } = await import('../../src/core/openspec.js');

      expect(
        buildOpenSpecInitCommand('/tmp/project', ['codex'], 'global', '/Users/Test User', 'darwin'),
      ).toBe("openspec init '/Users/Test User' --tools 'codex'");
      expect(
        buildOpenSpecInitCommand('/tmp/project', ['codex'], 'global', '/home/test user', 'linux'),
      ).toBe("openspec init '/home/test user' --tools 'codex'");
      expect(
        buildOpenSpecInitCommand(
          'D:\\Project\\Comet',
          ['codex'],
          'global',
          'C:\\Users\\Test User',
          'win32',
        ),
      ).toBe('openspec init "C:\\Users\\Test User" --tools "codex"');
    });

    it('quotes the joined OpenSpec tools argument', async () => {
      const { buildOpenSpecInitCommand } = await import('../../src/core/openspec.js');

      expect(
        buildOpenSpecInitCommand(
          '/tmp/project',
          ['future tool', 'codex'],
          'project',
          '/home/user',
          'linux',
        ),
      ).toBe("openspec init '/tmp/project' --tools 'future tool,codex'");
    });

    it('installs openspec CLI when not on PATH', async () => {
      // First call: isCommandAvailable fails
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      // Second call: npm install succeeds
      mockedExecSync.mockReturnValueOnce(Buffer.from('installed'));
      // Third call: isCommandAvailable succeeds after install
      mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/openspec'));
      // Fourth call: openspec init succeeds
      mockedExecSync.mockReturnValueOnce(Buffer.from('ok'));

      const { installOpenSpec } = await import('../../src/core/openspec.js');
      const result = await installOpenSpec('/tmp/test', ['claude'], 'project');

      expect(result).toBe('installed');
    });

    it('returns failed when openspec init throws', async () => {
      mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/openspec'));
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('init failed');
      });

      const { installOpenSpec } = await import('../../src/core/openspec.js');
      const result = await installOpenSpec('/tmp/test', ['claude'], 'project');

      expect(result).toBe('failed');
    });
  });
});
