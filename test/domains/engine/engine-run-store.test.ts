import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  appendTrajectory,
  clearPendingAction,
  readArtifacts,
  readCheckpoint,
  readContext,
  readPendingAction,
  readTrajectory,
  writeArtifacts,
  writeCheckpoint,
  writeContext,
  writePendingAction,
} from '../../../domains/engine/run-store.js';
import type { Checkpoint, EngineAction, TrajectoryEvent } from '../../../domains/engine/types.js';

describe('run store', () => {
  let changeDir: string;

  beforeEach(async () => {
    changeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-run-store-'));
  });

  afterEach(async () => {
    await fs.rm(changeDir, { recursive: true, force: true });
  });

  it('appends trajectory events and atomically round-trips run files', async () => {
    const event: TrajectoryEvent = {
      sequence: 1,
      timestamp: '2026-06-13T00:00:00.000Z',
      type: 'run_started',
      runId: 'run-1',
      data: {},
    };
    const action: EngineAction = {
      id: 'action-1',
      stepId: 'start',
      type: 'invoke_skill',
      ref: 'writing-plans',
    };
    const checkpoint: Checkpoint = {
      runId: 'run-1',
      stateVersion: 1,
      trajectoryOffset: 1,
      contextHash: null,
      artifactsHash: 'a'.repeat(64),
      createdAt: '2026-06-13T00:00:00.000Z',
    };

    await appendTrajectory(changeDir, '.comet/trajectory.jsonl', event);
    await writeArtifacts(changeDir, '.comet/artifacts.json', { report: 'report.md' });
    await writeContext(changeDir, '.comet/context.md', '# Context\n');
    await writePendingAction(changeDir, '.comet/pending-action.json', action);
    await writeCheckpoint(changeDir, '.comet/checkpoint.json', checkpoint);

    expect(await readArtifacts(changeDir, '.comet/artifacts.json')).toEqual({
      report: 'report.md',
    });
    expect(await readPendingAction(changeDir, '.comet/pending-action.json')).toEqual(action);
    await clearPendingAction(changeDir, '.comet/pending-action.json');
    expect(await readPendingAction(changeDir, '.comet/pending-action.json')).toBeNull();
    expect(await readContext(changeDir, '.comet/context.md')).toBe('# Context\n');
    expect(await readCheckpoint(changeDir, '.comet/checkpoint.json')).toEqual(checkpoint);
    expect(await readTrajectory(changeDir, '.comet/trajectory.jsonl')).toEqual([event]);
  });

  it('returns empty recovery values when optional Run files do not exist', async () => {
    expect(await readArtifacts(changeDir, '.comet/artifacts.json')).toEqual({});
    expect(await readContext(changeDir, '.comet/context.md')).toBeNull();
    expect(await readPendingAction(changeDir, '.comet/pending-action.json')).toBeNull();
    expect(await readCheckpoint(changeDir, '.comet/checkpoint.json')).toBeNull();
    expect(await readTrajectory(changeDir, '.comet/trajectory.jsonl')).toEqual([]);
  });

  it('reports the malformed Trajectory line during recovery', async () => {
    const file = path.join(changeDir, '.comet', 'trajectory.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{"sequence":1}\nnot-json\n');

    await expect(readTrajectory(changeDir, '.comet/trajectory.jsonl')).rejects.toThrow(
      'Invalid Trajectory event at line 2',
    );
  });

  it('rejects paths outside the change directory', async () => {
    await expect(writeContext(changeDir, '../outside.md', 'x')).rejects.toThrow(
      'Run path must stay inside the change directory',
    );
  });
});
