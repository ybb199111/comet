import { describe, expect, it } from 'vitest';
import {
  getManagedSkillPaths,
  getManifestSkills,
  getUserFacingSkillNames,
  readManifest,
  type Manifest,
} from '../../../domains/skill/platform-install.js';

const manifest: Manifest = {
  version: '1.0.0',
  skills: ['comet/SKILL.md', 'comet-open/SKILL.md', 'comet/scripts/runtime.mjs'],
  internalSkills: ['comet/runtime/classic/skill.yaml'],
};

describe('internal Skill assets', () => {
  it('includes internal Skills in managed lifecycle paths', () => {
    expect(getManagedSkillPaths(manifest)).toEqual([
      'comet/SKILL.md',
      'comet-open/SKILL.md',
      'comet/scripts/runtime.mjs',
      'comet/runtime/classic/skill.yaml',
    ]);
  });

  it('excludes internal Skills from user-facing command names', () => {
    expect(getUserFacingSkillNames(manifest)).toEqual(['comet', 'comet-open']);
  });

  it('declares the internalSkills collection in the shipped manifest', async () => {
    const shipped = await readManifest();

    expect(shipped.internalSkills).toEqual([
      'comet/runtime/classic/skill.yaml',
      'comet/runtime/classic/guardrails.yaml',
      'comet/runtime/classic/checks.yaml',
    ]);
    expect(getUserFacingSkillNames(shipped)).not.toContain('comet-classic');
    expect(getUserFacingSkillNames(shipped)).not.toContain('runtime');
    expect(await getManifestSkills()).toEqual(getManagedSkillPaths(shipped));
  });
});
