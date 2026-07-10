import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

interface EvalCommandOptions {
  project?: string;
  manifest?: string;
  skillPath?: string;
  skillName?: string;
  profile?: string;
  task?: string;
  reportConfig?: string;
  html?: boolean;
  quick?: boolean;
  collect?: boolean;
}

interface EvalLaunchDetails {
  mode: 'run' | 'collect';
  evalRoot: string;
  experimentId: string;
  profile: string;
  task: string;
  reportConfig: string | null;
  reportPath: string;
  target: string;
}

function projectRoot(options: EvalCommandOptions): string {
  return path.resolve(options.project ?? '.');
}

function evalRoot(options: EvalCommandOptions): string {
  return path.join(projectRoot(options), 'eval');
}

function assertTarget(options: EvalCommandOptions): void {
  if (!options.manifest && !options.skillPath) {
    throw new Error('Pass one of --manifest or --skill-path');
  }
  if (options.manifest && options.skillPath) {
    throw new Error('Pass exactly one of --manifest or --skill-path');
  }
}

function inferredSkillName(target: string): string {
  const resolved = path.resolve(target);
  return path.basename(resolved) === 'SKILL.md'
    ? path.basename(path.dirname(resolved))
    : path.basename(resolved);
}

function isManifestTarget(target: string): boolean {
  const normalized = target.replace(/\\/gu, '/').toLowerCase();
  return normalized.endsWith('comet/eval.yaml') || normalized.endsWith('comet/eval.yml');
}

function optionsWithTarget(
  target: string | undefined,
  options: EvalCommandOptions,
): EvalCommandOptions {
  if (!target) return options;
  if (options.manifest || options.skillPath) {
    throw new Error('Pass either a target or explicit --manifest/--skill-path options');
  }
  if (isManifestTarget(target)) {
    return {
      ...options,
      manifest: target,
    };
  }
  return {
    ...options,
    skillPath: target,
    skillName: options.skillName ?? inferredSkillName(target),
  };
}

function resolveProfile(options: EvalCommandOptions): string {
  return options.profile ?? 'generic';
}

function resolveTask(options: EvalCommandOptions): string {
  if (options.task) return options.task;
  if (options.skillPath && options.quick !== false) return 'generic-skill-smoke';
  return 'recommended';
}

async function resolveReportConfig(options: EvalCommandOptions): Promise<string | null> {
  if (options.reportConfig) return path.resolve(options.reportConfig);
  if (!options.html) return null;

  const file = path.join(os.tmpdir(), `comet-eval-report-${Date.now()}.json`);
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        report_outputs: {
          markdown: true,
          html: true,
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return file;
}

async function buildEvalArgs(
  options: EvalCommandOptions,
  collectOnly: boolean,
  resolvedReportConfig?: string | null,
): Promise<string[]> {
  assertTarget(options);

  const args = ['run', 'pytest', 'local/tests/tasks/test_tasks.py'];

  if (options.manifest) {
    args.push(`--eval-manifest=${path.resolve(options.manifest)}`);
  } else if (options.skillPath) {
    const task = options.task ?? (options.quick !== false ? 'generic-skill-smoke' : undefined);
    if (task) args.push(`--task=${task}`);
    args.push(`--skill-path=${path.resolve(options.skillPath)}`);
    if (options.skillName) args.push(`--skill-name=${options.skillName}`);
    if (options.profile) args.push(`--profile=${options.profile}`);
  }

  if (options.task && options.manifest) {
    args.push(`--task=${options.task}`);
  }

  const reportConfig =
    resolvedReportConfig === undefined ? await resolveReportConfig(options) : resolvedReportConfig;
  if (reportConfig) args.push(`--report-config=${reportConfig}`);

  if (collectOnly) {
    args.push('--collect-only');
  } else {
    args.push('-v');
  }

  return args;
}

async function buildLaunchDetails(
  options: EvalCommandOptions,
  collectOnly: boolean,
): Promise<EvalLaunchDetails> {
  const reportConfig = await resolveReportConfig(options);
  return {
    mode: collectOnly ? 'collect' : 'run',
    evalRoot: evalRoot(options),
    experimentId: `comet-eval-${Date.now()}`,
    profile: resolveProfile(options),
    task: resolveTask(options),
    reportConfig,
    reportPath: path.join(
      evalRoot(options),
      'local',
      'logs',
      'experiments',
      '<experiment-id>',
      reportConfig ? 'summary.html' : 'summary.md',
    ),
    target: options.manifest
      ? `manifest ${path.resolve(options.manifest)}`
      : `skill ${path.resolve(options.skillPath!)}`,
  };
}

function printLaunchDetails(details: EvalLaunchDetails): void {
  console.log(`Eval root: ${details.evalRoot}`);
  console.log(`Mode: ${details.mode}`);
  console.log(`Target: ${details.target}`);
  console.log(`Experiment: ${details.experimentId}`);
  console.log(`Profile: ${details.profile}`);
  console.log(`Task: ${details.task}`);
  console.log(`Report path: ${details.reportPath}`);
  if (details.reportConfig) {
    console.log(`Report config: ${details.reportConfig}`);
  }
  if (details.mode === 'run') {
    console.log(
      'Failure attribution: the generated benchmark summary records harness, workflow, task, and model buckets for failed checks.',
    );
  }
}

function assertUvAvailable(): void {
  try {
    execFileSync('uv', ['--version'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'uv is not installed or not in PATH.\n' +
        'Install it: https://docs.astral.sh/uv/getting-started/installation/',
    );
  }
}

function runEval(args: string[], options: EvalCommandOptions): void {
  assertUvAvailable();
  execFileSync('uv', args, {
    cwd: evalRoot(options),
    stdio: 'inherit',
  });
}

export async function evalRunCommand(options: EvalCommandOptions = {}): Promise<void> {
  assertTarget(options);
  const details = await buildLaunchDetails(options, false);
  const args = await buildEvalArgs(options, false, details.reportConfig);
  printLaunchDetails(details);
  runEval(args, options);
}

export async function evalCollectCommand(options: EvalCommandOptions = {}): Promise<void> {
  assertTarget(options);
  const details = await buildLaunchDetails(options, true);
  const args = await buildEvalArgs(options, true, details.reportConfig);
  printLaunchDetails(details);
  runEval(args, options);
}

export async function evalCommand(
  target?: string,
  options: EvalCommandOptions = {},
): Promise<void> {
  const resolvedOptions = optionsWithTarget(target, options);
  if (resolvedOptions.collect) {
    await evalCollectCommand(resolvedOptions);
    return;
  }
  await evalRunCommand(resolvedOptions);
}

export type { EvalCommandOptions };
