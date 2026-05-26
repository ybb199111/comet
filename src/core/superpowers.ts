import { execSync } from 'child_process';

import { quoteShellArg } from './openspec.js';
import type { InstallScope } from './types.js';

const SKILLS_AGENT_MAP: Record<string, string> = {
  claude: 'claude-code',
  cursor: 'cursor',
  codex: 'codex',
  opencode: 'opencode',
  windsurf: 'windsurf',
  cline: 'cline',
  roocode: 'roo',
  continue: 'continue',
  'github-copilot': 'github-copilot',
  gemini: 'gemini-cli',
  'amazon-q': 'universal',
  qwen: 'qwen-code',
  kilocode: 'kilo',
  auggie: 'augment',
  kiro: 'kiro-cli',
  lingma: 'universal',
  junie: 'junie',
  codebuddy: 'codebuddy',
  costrict: 'universal',
  crush: 'crush',
  factory: 'droid',
  iflow: 'iflow-cli',
  pi: 'pi',
  qoder: 'qoder',
  antigravity: 'antigravity',
  bob: 'bob',
  forgecode: 'forgecode',
  trae: 'trae',
};

const VALID_PLATFORM_IDS = new Set(Object.keys(SKILLS_AGENT_MAP));
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, 'g');

function buildSuperpowersInstallCommand(
  _projectPath: string,
  scope: InstallScope,
  platformIds: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  const unknownIds = platformIds.filter((id) => !VALID_PLATFORM_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown platform IDs: ${unknownIds.join(', ')}`);
  }

  const agentNames = [...new Set(platformIds.map((id) => SKILLS_AGENT_MAP[id]).filter(Boolean))];

  if (agentNames.length === 0) {
    throw new Error(`No valid agent names resolved for platforms: ${platformIds.join(', ')}`);
  }

  const agentFlags = agentNames.map((name) => `--agent ${quoteShellArg(name, platform)}`).join(' ');
  const flags = ['-y', scope === 'global' ? '-g' : '', agentFlags].filter(Boolean).join(' ');
  return `npx skills add obra/superpowers ${flags}`;
}

async function installSuperpowersForPlatforms(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
): Promise<'installed' | 'failed' | 'skipped'> {
  const command = buildSuperpowersInstallCommand(projectPath, scope, platformIds);

  try {
    execSync(command, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120_000,
    });
    return 'installed';
  } catch (error) {
    const execError = error as Error & { stderr?: Buffer };
    console.error(`    Superpowers install failed: ${execError.message}`);
    const stderr = execError.stderr?.toString().trim();
    if (stderr) {
      const cleaned = stderr
        .replace(ANSI_ESCAPE_PATTERN, '')
        .replace(/\[999D\[J/g, '')
        .replace(/\[\?25[hl]/g, '')
        .split('\n')
        .filter((line) => line.trim() && !/^(│|├|╮|╯|●|◇|◒|◐|◓|◑|■)/.test(line.trim()))
        .join('\n')
        .trim();
      if (cleaned) {
        console.error(`    ${cleaned.split('\n').join('\n    ')}`);
      }
    }
    return 'failed';
  }
}

export { installSuperpowersForPlatforms, buildSuperpowersInstallCommand, SKILLS_AGENT_MAP };
