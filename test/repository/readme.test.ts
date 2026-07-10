import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';

const readmes = ['README.md', 'README-zh.md'];

describe('README assets', () => {
  it.each(readmes)('uses npm-friendly absolute image URLs in %s', async (readmePath) => {
    const content = await fs.readFile(readmePath, 'utf-8');

    expect(content).not.toMatch(/\b(?:src|srcset)=["'](?:\.\/)?img\//);
    expect(content).toContain('https://github.com/rpamis/comet/blob/master/img/');
  });

  it('documents build_pause in README state examples and field descriptions', async () => {
    const en = await fs.readFile('README.md', 'utf-8');
    const zh = await fs.readFile('README-zh.md', 'utf-8');

    expect(en).toContain('build_pause: null');
    expect(en).toContain('`build_pause` records an internal build-phase pause point');
    expect(en).toContain('`plan-ready` means the plan has been generated');

    expect(zh).toContain('build_pause: null');
    expect(zh).toContain('`build_pause` 记录 build 阶段内部暂停点');
    expect(zh).toContain('`plan-ready` 表示 plan 已生成');
  });

  it('documents status and doctor as diagnostics-aware user commands', async () => {
    const readme = await fs.readFile('README.md', 'utf-8');

    expect(readme).toContain('runtime mode');
    expect(readme).toContain('current step');
    expect(readme).toContain('diagnostic');
  });

  it('keeps English and Chinese README feature summaries aligned', async () => {
    const readmeEn = await fs.readFile('README.md', 'utf-8');
    const readmeZh = await fs.readFile('README-zh.md', 'utf-8');

    expect(readmeZh).toContain('Skill 平台');
    expect(readmeEn).toContain('Skill platform');
  });

  it('documents task-first paths for comet-any and eval without making Bundle CLI the default user path', async () => {
    const readmeEn = await fs.readFile('README.md', 'utf-8');
    const readmeZh = await fs.readFile('README-zh.md', 'utf-8');

    expect(readmeEn).toContain('Create or optimize a reusable Skill');
    expect(readmeEn).toContain('`/comet-any` is the main user path');
    expect(readmeEn).toContain('`comet eval`');
    expect(readmeEn).toContain('`comet creator`');
    expect(readmeEn).toContain('`comet publish`');
    expect(readmeEn).toContain('`comet creator status` / `comet creator next`');
    expect(readmeEn).toContain('`comet publish distribute --preview`');
    expect(readmeEn).toContain('stable composed Skill');
    expect(readmeEn).toContain('Advanced Bundle backend');
    expect(readmeEn).toContain('Advanced Engine Run');
    expect(readmeEn).toContain('`comet skill run` / `comet skill continue`');
    expect(readmeEn).toContain('Skill creation guide');
    expect(readmeZh).toContain('创建或优化可复用 Skill');
    expect(readmeZh).toContain('`/comet-any` 是普通用户主路径');
    expect(readmeZh).toContain('`comet eval`');
    expect(readmeZh).toContain('`comet creator`');
    expect(readmeZh).toContain('`comet publish`');
    expect(readmeZh).toContain('`comet creator status` / `comet creator next`');
    expect(readmeZh).toContain('`comet publish distribute --preview`');
    expect(readmeZh).toContain('稳定组合 Skill');
    expect(readmeZh).toContain('高级 Bundle 后端');
    expect(readmeZh).toContain('高级 Engine Run');
    expect(readmeZh).toContain('`comet skill run` / `comet skill continue`');
    expect(readmeZh).toContain('Skill 创建文档');
  });

  it('keeps Skill Creator backend commands in advanced operation docs', async () => {
    const guideEn = await fs.readFile('docs/operations/SKILL-CREATION.md', 'utf-8');
    const guideZh = await fs.readFile('docs/operations/SKILL-CREATION-ZH.md', 'utf-8');
    const ordinaryEn = guideEn.split('## Advanced backend reference')[0];
    const ordinaryZh = guideZh.split('## 高级后端参考')[0];

    expect(guideEn).toContain('## Advanced backend reference');
    expect(guideZh).toContain('## 高级后端参考');
    expect(guideEn).toContain('comet creator next <name>');
    expect(guideZh).toContain('comet creator next <name>');
    expect(ordinaryEn).not.toContain('comet bundle factory-guide');
    expect(ordinaryEn).not.toContain('comet bundle factory-propose');
    expect(ordinaryEn).not.toContain('comet bundle factory-init');
    expect(ordinaryEn).not.toContain('comet bundle list');
    expect(ordinaryEn).not.toContain('comet bundle status');
    expect(ordinaryZh).not.toContain('comet bundle factory-guide');
    expect(ordinaryZh).not.toContain('comet bundle factory-propose');
    expect(ordinaryZh).not.toContain('comet bundle factory-init');
    expect(ordinaryZh).not.toContain('comet bundle list');
    expect(ordinaryZh).not.toContain('comet bundle status');
  });
});
