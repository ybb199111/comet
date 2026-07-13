import path from 'path';
import type { SkillLanguageId } from './languages.js';
import {
  mergeManagedMarkdownBlock,
  removeManagedMarkdownBlock,
  type ManagedMarkdownBlockResult,
} from './managed-markdown.js';

export const COMET_AMBIENT_RESUME_TAG = 'comet-ambient-resume';
export const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const;

export interface ProjectInstructionResult {
  files: Array<{ file: string; result: ManagedMarkdownBlockResult }>;
  changed: number;
}

export interface ProjectInstructionRemovalResult {
  files: Array<{ file: string; result: ManagedMarkdownBlockResult }>;
  removed: number;
}

export function renderCometAmbientResumeContent(languageId: SkillLanguageId): string {
  if (languageId === 'zh') {
    return [
      '<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->',
      '',
      '## Comet Ambient Resume',
      '',
      '在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，先运行只读 resume probe。',
      '',
      '- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并按 `nextCommand` 恢复。',
      '- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。',
      '- 如果 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。',
      '- 不能只因为存在 `.comet.yaml` 就把无关任务挂到 active Comet change。',
      '',
    ].join('\n');
  }

  return [
    '<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->',
    '',
    '## Comet Ambient Resume',
    '',
    'In this repository, before starting work that may need code changes or investigation, run the Comet resume probe (read-only) if a Comet workflow may already be active.',
    '',
    '- If the probe returns `auto_resume`, briefly state the selected active change and continue through its `nextCommand`.',
    '- If the probe returns `ask_user`, ask one short question and wait.',
    '- If the probe returns `out_of_scope` or `none`, do not enter the Comet workflow.',
    '- Never attach unrelated work to an active Comet change only because `.comet.yaml` exists.',
    '',
  ].join('\n');
}

export async function installCometProjectInstructions(
  projectPath: string,
  languageId: SkillLanguageId,
): Promise<ProjectInstructionResult> {
  const content = renderCometAmbientResumeContent(languageId);
  const files = [];

  for (const file of PROJECT_INSTRUCTION_FILES) {
    const result = await mergeManagedMarkdownBlock(path.join(projectPath, file), {
      tagName: COMET_AMBIENT_RESUME_TAG,
      content,
    });
    files.push({ file, result });
  }

  return {
    files,
    changed: files.filter((entry) => entry.result.changed).length,
  };
}

export async function removeCometProjectInstructions(
  projectPath: string,
): Promise<ProjectInstructionRemovalResult> {
  const files = [];

  for (const file of PROJECT_INSTRUCTION_FILES) {
    const result = await removeManagedMarkdownBlock(
      path.join(projectPath, file),
      COMET_AMBIENT_RESUME_TAG,
    );
    files.push({ file, result });
  }

  return {
    files,
    removed: files.filter((entry) => entry.result.action === 'removed').length,
  };
}
