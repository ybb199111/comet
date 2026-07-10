import {
  readRepositoryLayout,
  resolveRepositoryPath,
} from '../../platform/paths/repository-layout.js';

export interface RepositoryEvalWorkspace {
  root: string;
  localRoot: string;
  langsmithRoot: string;
}

export function resolveRepositoryEvalWorkspace(): RepositoryEvalWorkspace {
  const layout = readRepositoryLayout();
  void layout;
  return {
    root: resolveRepositoryPath('eval'),
    localRoot: resolveRepositoryPath('eval/local'),
    langsmithRoot: resolveRepositoryPath('eval/langsmith'),
  };
}
