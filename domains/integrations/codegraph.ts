import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isCommandAvailable, getNpmExecutable } from './openspec.js';
import { printCommandErrorDetails } from '../../platform/process/command-error.js';

import type { InstallScope } from '../../platform/install/types.js';

function getPnpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function hasCodegraphProjectIndex(projectPath: string): boolean {
  const codegraphDir = path.join(projectPath, '.codegraph');
  try {
    if (!fs.statSync(codegraphDir).isDirectory()) return false;
    return fs.readdirSync(codegraphDir).some((entry) => entry !== '.gitignore');
  } catch {
    return false;
  }
}

function resolvePnpmGlobalCommand(command: string): string | null {
  try {
    const binDir = execFileSync(getPnpmExecutable(), ['bin', '-g'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    }).trim();
    if (!binDir) return null;

    const candidates =
      process.platform === 'win32'
        ? [`${command}.cmd`, `${command}.exe`, `${command}.ps1`, command]
        : [command];

    for (const candidate of candidates) {
      const candidatePath = path.join(binDir, candidate);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
  } catch {
    // pnpm may not be installed or may not have a global bin configured.
  }

  return null;
}

function resolveCodegraphCommand(): string | null {
  if (isCommandAvailable('codegraph')) return 'codegraph';
  return resolvePnpmGlobalCommand('codegraph');
}

async function ensureCodegraphCli(
  projectPath: string,
  shouldInstall = true,
): Promise<string | null> {
  const existingCommand = resolveCodegraphCommand();
  if (existingCommand) return existingCommand;
  if (!shouldInstall) return null;

  console.log('    Installing CodeGraph CLI...');
  try {
    execFileSync(getNpmExecutable(), ['install', '-g', '@colbymchenry/codegraph'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 180_000,
      shell: process.platform === 'win32',
    });
    return resolveCodegraphCommand();
  } catch (error) {
    console.error(`    Failed to install CodeGraph CLI: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return null;
  }
}

async function installCodegraph(
  projectPath: string,
  scope: InstallScope,
  shouldInstallCli = true,
): Promise<'installed' | 'failed' | 'skipped'> {
  if (hasCodegraphProjectIndex(projectPath)) {
    console.log('    CodeGraph: existing .codegraph index detected');
    return 'skipped';
  }

  const codegraphCommand = await ensureCodegraphCli(projectPath, shouldInstallCli);
  if (!codegraphCommand) {
    if (!shouldInstallCli) {
      console.log('    CodeGraph CLI not installed, skipping setup');
      return 'skipped';
    }
    console.error(
      '    CodeGraph CLI not available. Install manually: npm install -g @colbymchenry/codegraph',
    );
    return 'failed';
  }

  try {
    console.log('    Running: codegraph install --yes');
    execFileSync(codegraphCommand, ['install', '--yes'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 120_000,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    console.error(`    CodeGraph install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  }

  if (scope === 'project') {
    try {
      console.log('    Running: codegraph init -i');
      execFileSync(codegraphCommand, ['init', '-i'], {
        cwd: projectPath,
        stdio: 'inherit',
        timeout: 300_000,
        shell: process.platform === 'win32',
      });
    } catch (error) {
      console.error(`    CodeGraph init failed: ${(error as Error).message}`);
      printCommandErrorDetails(error);
      return 'failed';
    }
  }

  return 'installed';
}

export { installCodegraph, hasCodegraphProjectIndex, resolveCodegraphCommand };
