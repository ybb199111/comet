import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

async function readTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result[path.relative(root, target).replace(/\\/gu, '/')] = await fs.readFile(
          target,
          'utf8',
        );
      }
    }
  }
  await visit(root);
  return result;
}

async function readCometAny(locale: 'zh' | 'en'): Promise<Record<string, string>> {
  return readTree(path.resolve('assets', locale === 'zh' ? 'skills-zh' : 'skills', 'comet-any'));
}

describe('comet-any Skill workflow contract docs', () => {
  it('uses the new Workflow Contract vocabulary in Chinese docs', async () => {
    const docs = await readCometAny('zh');
    const combined = Object.values(docs).join('\n');

    for (const expected of [
      '基于 Comet 现有 Skill 的五阶段定制',
      'Workflow Node',
      'Skill Binding',
      'Output Schema',
      'Required Skill Call',
      'Guardrail',
      'Handoff',
      'workflow-protocol.json',
      'comet-five-phase-overlay',
      'workflow-kernel',
      'execute',
      'subagent-execute',
      'review',
      'elementui',
      'whitebox-code-standard',
      'Output Schema 必须挂到具体 Workflow Node 才算生效',
      'guarded',
      'handoff-guarded',
      'evidence-only',
      'advisory',
      '不得创建 `.comet/runs/<workflow>/state.json` 作为 Comet overlay 主状态',
      '当前 draft hash 的 eval evidence',
      'platform-native custom agent',
      '`reference/subagents/*.md` 是跨平台 lane brief；Claude Code custom agent 必须单独生成到平台 agent 资源，并带 `name`、`description`、`tools`、`model` frontmatter。',
    ]) {
      expect(combined).toContain(expected);
    }
  });

  it('uses the same Workflow Contract vocabulary in English docs', async () => {
    const docs = await readCometAny('en');
    const combined = Object.values(docs).join('\n');

    for (const expected of [
      'customize existing Comet Skills',
      'Workflow Node',
      'Skill Binding',
      'Output Schema',
      'Required Skill Call',
      'Guardrail',
      'Handoff',
      'workflow-protocol.json',
      'comet-five-phase-overlay',
      'workflow-kernel',
      'execute',
      'subagent-execute',
      'review',
      'elementui',
      'whitebox-code-standard',
      'Output Schema must be attached to a concrete Workflow Node',
      'guarded',
      'handoff-guarded',
      'evidence-only',
      'advisory',
      'must not create `.comet/runs/<workflow>/state.json` as the Comet overlay primary state',
      'current draft hash eval evidence',
      'platform-native custom agent',
      '`reference/subagents/*.md` are portable lane briefs; Claude Code custom agents must be generated separately as platform agent resources with `name`, `description`, `tools`, and `model` frontmatter.',
    ]) {
      expect(combined).toContain(expected);
    }
  });
});
