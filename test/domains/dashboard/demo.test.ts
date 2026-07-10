import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

describe('dashboard demo data', () => {
  it('uses eval readiness wording in the user-visible Skill Creator demo', async () => {
    const source = await fs.readFile(path.resolve('domains/dashboard/web/demo.js'), 'utf8');

    expect(source).toContain('Eval result attached');
    expect(source).toContain("currentStep: 'needs-eval'");
    expect(source).not.toContain('Benchmark result attached');
    expect(source).not.toContain("currentStep: 'needs-benchmark'");
  });
});
