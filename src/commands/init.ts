import path from 'path';
import os from 'os';
import { checkbox, select } from '@inquirer/prompts';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/platforms.js';
import { detectPlatforms, hasSkills, getBaseDir, type InstallScope } from '../core/detect.js';
import {
  copyCometSkillsForPlatform,
  copyCometRulesForPlatform,
  installCometHooksForPlatform,
  createWorkingDirs,
  type LanguageConfig,
} from '../core/skills.js';
import { installOpenSpec } from '../core/openspec.js';
import { installSuperpowersForPlatforms } from '../core/superpowers.js';
import { installCodegraph } from '../core/codegraph.js';
import { printVersionInfo } from '../core/version.js';

type InitOptions = {
  yes?: boolean;
  skipExisting?: boolean;
  overwrite?: boolean;
  json?: boolean;
  scope?: InstallScope;
  language?: string;
};

type InstallStatus = 'installed' | 'skipped' | 'failed';
type ComponentAction = 'overwrite' | 'skip' | 'install';
type BulkOverwriteChoice = 'overwrite-all' | 'skip-all' | 'choose';

interface PlatformResult {
  platform: Platform;
  openspec: InstallStatus;
  superpowers: InstallStatus;
  comet: InstallStatus;
  codegraph: InstallStatus;
}

type ComponentPlan = {
  osAction: ComponentAction;
  spAction: ComponentAction;
  cmAction: ComponentAction;
};

const LANGUAGES: LanguageConfig[] = [
  { id: 'en', name: 'English', skillsDir: 'skills' },
  { id: 'zh', name: '中文', skillsDir: 'skills-zh' },
];

type TranslationKey =
  | 'settingUp'
  | 'installScope'
  | 'scopeProject'
  | 'scopeGlobal'
  | 'languagePrompt'
  | 'selectPlatforms'
  | 'detected'
  | 'noPlatforms'
  | 'overwriteChoice'
  | 'overwrite'
  | 'skip'
  | 'bulkOverwrite'
  | 'overwriteAll'
  | 'skipAll'
  | 'choosePer'
  | 'installingOS'
  | 'allSkipped'
  | 'installingSP'
  | 'alreadyExists'
  | 'rulesInstalled'
  | 'hooksInstalled'
  | 'hooksSkipped'
  | 'installCodegraph'
  | 'codegraphYes'
  | 'codegraphNo'
  | 'installingCG'
  | 'setupComplete'
  | 'installed'
  | 'skippedLabel'
  | 'failedLabel'
  | 'workingDirs'
  | 'getStarted'
  | 'getStartedComet'
  | 'getStartedHotfix'
  | 'getStartedTweak';

const TRANSLATIONS: Record<string, Record<TranslationKey, string>> = {
  en: {
    settingUp: 'Setting up Comet in',
    installScope: 'Install scope:',
    scopeProject: 'Project (current directory)',
    scopeGlobal: 'Global (home directory)',
    languagePrompt: 'Language for Comet skills:',
    selectPlatforms: 'Select platforms to set up:',
    detected: 'detected',
    noPlatforms: 'No platforms selected. Exiting.',
    overwriteChoice: 'What to do?',
    overwrite: 'Overwrite',
    skip: 'Skip',
    bulkOverwrite: 'already has',
    overwriteAll: 'Overwrite all existing components',
    skipAll: 'Skip all existing components',
    choosePer: 'Choose per component',
    installingOS: 'Installing OpenSpec for:',
    allSkipped: 'all skipped',
    installingSP: 'Installing Superpowers for:',
    alreadyExists: 'already exists',
    rulesInstalled: 'rule(s) installed',
    hooksInstalled: 'phase guard hook installed',
    hooksSkipped: 'skipped',
    installCodegraph: 'Install CodeGraph for semantic code intelligence?',
    codegraphYes: 'Yes (recommended — saves ~16% cost · cuts ~58% tool calls)',
    codegraphNo: 'No',
    installingCG: 'Installing CodeGraph...',
    setupComplete: 'Comet setup complete!',
    installed: 'Installed:',
    skippedLabel: 'Skipped:',
    failedLabel: 'Failed:',
    workingDirs: 'Working directories: docs/superpowers/specs/, docs/superpowers/plans/',
    getStarted: 'Get started:',
    getStartedComet: '/comet "your idea"  — Start a new change with full workflow',
    getStartedHotfix: '/comet-hotfix       — Quick bug fix (skip brainstorming)',
    getStartedTweak: '/comet-tweak        — Small change (skip brainstorming and plan)',
  },
  zh: {
    settingUp: '正在设置 Comet：',
    installScope: '安装范围：',
    scopeProject: '项目（当前目录）',
    scopeGlobal: '全局（主目录）',
    languagePrompt: 'Comet 技能语言：',
    selectPlatforms: '选择要配置的平台：',
    detected: '已检测到',
    noPlatforms: '未选择任何平台，退出。',
    overwriteChoice: '如何处理？',
    overwrite: '覆盖',
    skip: '跳过',
    bulkOverwrite: '已安装',
    overwriteAll: '覆盖所有已有组件',
    skipAll: '跳过所有已有组件',
    choosePer: '逐个选择',
    installingOS: '正在安装 OpenSpec：',
    allSkipped: '全部跳过',
    installingSP: '正在安装 Superpowers：',
    alreadyExists: '已存在',
    rulesInstalled: '个规则已安装',
    hooksInstalled: '阶段守卫钩子已安装',
    hooksSkipped: '已跳过',
    installCodegraph: '是否安装 CodeGraph（语义代码智能）？',
    codegraphYes: '是（推荐 — 节省约 16% 成本，减少约 58% 工具调用）',
    codegraphNo: '否',
    installingCG: '正在安装 CodeGraph...',
    setupComplete: 'Comet 设置完成！',
    installed: '已安装：',
    skippedLabel: '已跳过：',
    failedLabel: '失败：',
    workingDirs: '工作目录：docs/superpowers/specs/, docs/superpowers/plans/',
    getStarted: '开始使用：',
    getStartedComet: '/comet "你的想法"  — 启动完整工作流',
    getStartedHotfix: '/comet-hotfix       — 快速修复（跳过 brainstorming）',
    getStartedTweak: '/comet-tweak        — 小改动（跳过 brainstorming 和完整 plan）',
  },
};

/**
 * 根据语言获取对应的翻译文本
 * @param lang - 语言代码（'en' | 'zh'）
 * @param key - 翻译键
 * @returns 对应语言的翻译文本，找不到时回退到英文
 */
function t(lang: string, key: TranslationKey): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key];
}

const COMET_BANNER = [
  `   ██████╗ ██████╗ ███╗   ███╗███████╗████████╗`,
  `  ██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝`,
  `  ██║     ██║   ██║██╔████╔██║█████╗     ██║   `,
  `  ██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║   `,
  `  ╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   `,
  `   ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   `,
  `            OpenSpec + Superpowers Workflow       `,
].join('\n');

/**
 * 交互式选择安装范围（项目级或全局）
 * @param options - 初始化选项
 * @param lang - 当前语言
 * @returns 选中的安装范围
 */
async function selectScope(options: InitOptions, lang: string): Promise<InstallScope> {
  if (options.scope) return options.scope;
  if (options.yes) return 'project';

  return select({
    message: t(lang, 'installScope'),
    choices: [
      { name: t(lang, 'scopeProject'), value: 'project' as const },
      { name: t(lang, 'scopeGlobal'), value: 'global' as const },
    ],
  });
}

/**
 * 交互式选择语言
 * @param options - 初始化选项
 * @returns 选中的语言配置
 */
async function selectLanguage(options: InitOptions): Promise<LanguageConfig> {
  if (options.language) {
    return LANGUAGES.find((l) => l.id === options.language) ?? LANGUAGES[0];
  }
  if (options.yes) return LANGUAGES[0];

  const langId = await select({
    message: t('en', 'languagePrompt'),
    choices: LANGUAGES.map((lang) => ({ name: lang.name, value: lang.id })),
  });

  return LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
}

/**
 * 交互式选择要安装的平台
 * @param detected - 已检测到的平台集合
 * @param options - 初始化选项
 * @param lang - 当前语言
 * @returns 选中的平台 ID 列表
 */
async function selectPlatforms(
  detected: Set<string>,
  options: InitOptions,
  lang: string,
): Promise<string[]> {
  const choices = PLATFORMS.map((p) => ({
    name: `${p.name}${detected.has(p.id) ? ` (${t(lang, 'detected')})` : ''}`,
    value: p.id,
    checked: detected.has(p.id),
  }));

  if (options.yes) {
    const selected = [...detected];
    return selected.length > 0 ? selected : PLATFORMS.map((p) => p.id);
  }

  return checkbox({ message: t(lang, 'selectPlatforms'), choices, required: true });
}

/**
 * 单个组件已存在时，询问用户是否覆盖
 * @param componentName - 组件名称
 * @param platformName - 平台名称
 * @param lang - 当前语言
 * @returns 用户选择：覆盖或跳过
 */
async function promptOverwriteChoice(
  componentName: string,
  platformName: string,
  lang: string,
): Promise<'overwrite' | 'skip'> {
  return select({
    message: `${componentName} ${t(lang, 'alreadyExists')} ${platformName}. ${t(lang, 'overwriteChoice')}`,
    choices: [
      { name: t(lang, 'overwrite'), value: 'overwrite' as const },
      { name: t(lang, 'skip'), value: 'skip' as const },
    ],
  });
}
/**
 * 批量组件已存在时，询问用户批量覆盖、跳过或逐个选择
 * @param platformName - 平台名称
 * @param components - 已存在的组件列表
 * @param lang - 当前语言
 * @returns 用户选择：全部覆盖 / 全部跳过 / 逐个选择
 */
async function promptBulkOverwriteChoice(
  platformName: string,
  components: string[],
  lang: string,
): Promise<BulkOverwriteChoice> {
  return select({
    message: `${platformName} ${t(lang, 'bulkOverwrite')} ${components.join(', ')}. ${t(lang, 'overwriteChoice')}`,
    choices: [
      { name: t(lang, 'overwriteAll'), value: 'overwrite-all' as const },
      { name: t(lang, 'skipAll'), value: 'skip-all' as const },
      { name: t(lang, 'choosePer'), value: 'choose' as const },
    ],
  });
}

/**
 * 根据批量覆盖选择结果应用 action 到组件计划
 * @param plan - 原始组件计划
 * @param choice - 批量选择结果（排除 'choose'）
 * @param hasExisting - 各组件是否已存在
 * @returns 更新后的组件计划
 */
function applyBulkOverwriteChoice<T extends ComponentPlan>(
  plan: T,
  choice: Exclude<BulkOverwriteChoice, 'choose'>,
  hasExisting?: { os?: boolean; sp?: boolean; cm?: boolean },
): T {
  const action = choice === 'overwrite-all' ? 'overwrite' : 'skip';
  const shouldApply = (actionState: ComponentAction, exists?: boolean) =>
    actionState === 'install' && (hasExisting === undefined || exists === true);
  return {
    ...plan,
    osAction: shouldApply(plan.osAction, hasExisting?.os) ? action : plan.osAction,
    spAction: shouldApply(plan.spAction, hasExisting?.sp) ? action : plan.spAction,
    cmAction: shouldApply(plan.cmAction, hasExisting?.cm) ? action : plan.cmAction,
  };
}

/**
 * 根据现有状态和选项解析安装动作
 * @param hasExisting - 目标是否已存在
 * @param options - 初始化选项
 * @returns 解析后的动作：install / overwrite / skip
 */
function resolveAction(
  hasExisting: boolean,
  options: InitOptions,
): 'overwrite' | 'skip' | 'install' {
  if (!hasExisting) return 'install';
  if (options.overwrite) return 'overwrite';
  if (options.skipExisting) return 'skip';
  if (options.yes) return 'skip';
  return 'install';
}

/**
 * 显示安装结果摘要
 * @param results - 各平台的安装结果
 * @param scope - 安装范围
 * @param lang - 当前语言
 */
function displaySummary(results: PlatformResult[], scope: InstallScope, lang: string): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(`\n  ${t(lang, 'setupComplete')} (scope: ${scopeLabel})\n`);

  const installed = results.filter(
    (r) =>
      r.openspec === 'installed' ||
      r.superpowers === 'installed' ||
      r.comet === 'installed' ||
      r.codegraph === 'installed',
  );
  const skipped = results.filter(
    (r) =>
      r.openspec === 'skipped' &&
      r.superpowers === 'skipped' &&
      r.comet === 'skipped' &&
      r.codegraph === 'skipped',
  );
  const failed = results.filter(
    (r) =>
      r.openspec === 'failed' ||
      r.superpowers === 'failed' ||
      r.comet === 'failed' ||
      r.codegraph === 'failed',
  );

  if (installed.length > 0) {
    console.log(`  ${t(lang, 'installed')}`);
    for (const r of installed) {
      console.log(`    ${r.platform.name} -> ${getPlatformSkillsDir(r.platform, scope)}/skills/`);
    }
  }
  if (skipped.length > 0) {
    console.log(`  ${t(lang, 'skippedLabel')} ${skipped.map((r) => r.platform.name).join(', ')}`);
  }
  if (failed.length > 0) {
    console.log(`  ${t(lang, 'failedLabel')} ${failed.map((r) => r.platform.name).join(', ')}`);
  }

  if (scope === 'project') {
    console.log(`\n  ${t(lang, 'workingDirs')}`);
  }

  console.log(`\n  ${t(lang, 'getStarted')}`);
  console.log(`    ${t(lang, 'getStartedComet')}`);
  console.log(`    ${t(lang, 'getStartedHotfix')}`);
  console.log(`    ${t(lang, 'getStartedTweak')}\n`);
}

/**
 * 执行 Comet 初始化命令：选择语言、范围、平台并安装各组件
 * @param targetPath - 目标路径
 * @param options - 初始化选项
 */
export async function initCommand(targetPath: string, options: InitOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const log = options.json ? () => undefined : console.log;

  log(`\n${COMET_BANNER}\n`);
  if (!options.json) {
    await printVersionInfo(log);
  }

  // Select language first so all subsequent prompts can be localized
  const language = await selectLanguage(options);
  const lang = language.id;

  log(`  ${t(lang, 'settingUp')} ${projectPath}\n`);

  const detected = await detectPlatforms(projectPath);
  const scope = await selectScope(options, lang);

  const selectedPlatformIds = await selectPlatforms(detected, options, lang);
  if (selectedPlatformIds.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            projectPath,
            scope,
            language: language.id,
            selectedPlatforms: [],
            results: [],
          },
          null,
          2,
        ),
      );
      return;
    }
    log(`\n  ${t(lang, 'noPlatforms')}\n`);
    return;
  }

  const selectedPlatforms = PLATFORMS.filter((p) => selectedPlatformIds.includes(p.id));
  const baseDir = getBaseDir(scope, projectPath);

  type PlatformPlan = ComponentPlan & {
    platform: Platform;
    hasOS: boolean;
    hasSP: boolean;
    hasCM: boolean;
  };

  const plans: PlatformPlan[] = [];

  for (const platform of selectedPlatforms) {
    const hasOS = await hasSkills(baseDir, platform, 'openspec', selectedPlatforms, scope);
    const hasSP = await hasSkills(baseDir, platform, 'superpowers', selectedPlatforms, scope);
    const hasCM = await hasSkills(baseDir, platform, 'comet', selectedPlatforms, scope);

    let osAction = resolveAction(hasOS, options);
    let spAction = resolveAction(hasSP, options);
    let cmAction = resolveAction(hasCM, options);

    if (!options.yes) {
      const existingComponents = [
        hasOS && osAction === 'install' ? 'OpenSpec' : null,
        hasSP && spAction === 'install' ? 'Superpowers' : null,
        hasCM && cmAction === 'install' ? 'Comet' : null,
      ].filter((component): component is string => Boolean(component));

      if (existingComponents.length > 1) {
        const bulkChoice = await promptBulkOverwriteChoice(platform.name, existingComponents, lang);
        if (bulkChoice !== 'choose') {
          ({ osAction, spAction, cmAction } = applyBulkOverwriteChoice(
            { osAction, spAction, cmAction },
            bulkChoice,
            { os: hasOS, sp: hasSP, cm: hasCM },
          ));
        }
      }

      if (osAction === 'install' && hasOS) {
        osAction = await promptOverwriteChoice('OpenSpec', platform.name, lang);
      }
      if (spAction === 'install' && hasSP) {
        spAction = await promptOverwriteChoice('Superpowers', platform.name, lang);
      }
      if (cmAction === 'install' && hasCM) {
        cmAction = await promptOverwriteChoice('Comet', platform.name, lang);
      }
    }

    plans.push({ platform, osAction, spAction, cmAction, hasOS, hasSP, hasCM });
  }

  const osToolIds = plans
    .filter((p) => p.osAction !== 'skip')
    .map((p) => p.platform.openspecToolId);

  let osGlobalStatus: InstallStatus = 'skipped';
  if (osToolIds.length > 0) {
    log(`\n  ${t(lang, 'installingOS')} ${osToolIds.join(', ')}`);
    osGlobalStatus = await installOpenSpec(projectPath, osToolIds, scope);
    log(`  OpenSpec: ${osGlobalStatus}`);
  } else {
    log(`\n  OpenSpec: ${t(lang, 'allSkipped')}`);
  }

  const spPlatformIds = plans.filter((p) => p.spAction !== 'skip').map((p) => p.platform.id);
  let spGlobalStatus: InstallStatus = 'skipped';

  if (spPlatformIds.length > 0) {
    log(`\n  ${t(lang, 'installingSP')} ${spPlatformIds.join(', ')}`);
    spGlobalStatus = await installSuperpowersForPlatforms(projectPath, scope, spPlatformIds);
    log(`  Superpowers: ${spGlobalStatus}`);
  } else {
    log(`\n  Superpowers: ${t(lang, 'allSkipped')}`);
  }

  const results: PlatformResult[] = [];

  for (const plan of plans) {
    const { platform, cmAction } = plan;
    const platformSkillsDir = getPlatformSkillsDir(platform, scope);
    const skillsPath = `${scope === 'global' ? '~/' : ''}${platformSkillsDir}/skills/`;

    let cmStatus: InstallStatus = 'skipped';
    if (cmAction !== 'skip') {
      const { copied } = await copyCometSkillsForPlatform(
        baseDir,
        platform,
        cmAction === 'overwrite',
        language.skillsDir,
        scope,
      );
      cmStatus = copied > 0 ? 'installed' : 'skipped';
      log(`  Comet -> ${platform.name}: ${cmStatus} (${copied} files) -> ${skillsPath}`);
    } else {
      log(`  Comet -> ${platform.name}: skipped (${t(lang, 'alreadyExists')})`);
    }

    // Distribute anti-drift rules to platforms that support them
    if (cmAction !== 'skip') {
      const { copied: ruleCopied } = await copyCometRulesForPlatform(
        baseDir,
        platform,
        cmAction === 'overwrite',
        scope,
      );
      if (ruleCopied > 0) {
        log(`  Comet rules -> ${platform.name}: ${ruleCopied} ${t(lang, 'rulesInstalled')}`);
      }
    }

    // Install hooks for platforms that support them
    if (cmAction !== 'skip' && platform.supportsHooks) {
      const { installed, reason } = await installCometHooksForPlatform(baseDir, platform, scope);
      if (installed) {
        log(`  Comet hooks -> ${platform.name}: ${t(lang, 'hooksInstalled')}`);
      } else if (reason) {
        log(`  Comet hooks -> ${platform.name}: ${t(lang, 'hooksSkipped')} (${reason})`);
      }
    }

    results.push({
      platform,
      openspec: osToolIds.includes(platform.openspecToolId) ? osGlobalStatus : 'skipped',
      superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
      comet: cmStatus,
      codegraph: 'skipped',
    });
  }

  let cgGlobalStatus: InstallStatus;
  const shouldInstallCodegraph =
    !options.json &&
    (options.yes ||
      (await select({
        message: t(lang, 'installCodegraph'),
        choices: [
          { name: t(lang, 'codegraphYes'), value: true },
          { name: t(lang, 'codegraphNo'), value: false },
        ],
      })));

  if (shouldInstallCodegraph) {
    log(`\n  ${t(lang, 'installingCG')}`);
    cgGlobalStatus = await installCodegraph(projectPath, scope);
    log(`  CodeGraph: ${cgGlobalStatus}`);
    for (const r of results) {
      r.codegraph = cgGlobalStatus;
    }
  } else {
    log('\n  CodeGraph: skipped');
  }

  if (scope === 'project') {
    await createWorkingDirs(projectPath);
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          projectPath,
          scope,
          language: language.id,
          selectedPlatforms: selectedPlatformIds,
          results: results.map((result) => ({
            platform: result.platform.id,
            platformName: result.platform.name,
            openspec: result.openspec,
            superpowers: result.superpowers,
            comet: result.comet,
            codegraph: result.codegraph,
          })),
          workingDirsCreated: scope === 'project',
        },
        null,
        2,
      ),
    );
    return;
  }

  displaySummary(results, scope, lang);
}

export { applyBulkOverwriteChoice };
