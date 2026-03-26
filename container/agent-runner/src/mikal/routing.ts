import type { DroidTaskType } from './droid.js';

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function detectDroidTaskType(text: string): DroidTaskType | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (
    containsAny(t, [
      'readme',
      'documentation',
      'docs',
      'docstring',
      'api reference',
      'comment the code',
    ])
  ) {
    return 'docs';
  }

  const looksCodey =
    t.includes('```') ||
    containsAny(t, [
      'implement',
      'refactor',
      'fix',
      'bug',
      'error',
      'stack trace',
      'typescript',
      'javascript',
      'node',
      'npm',
      'pnpm',
      'yarn',
      'docker',
      'kubernetes',
      'sql',
      'postgres',
      'sqlite',
      'redis',
      'api',
      'endpoint',
      'http',
      'graphql',
      'react',
      'next.js',
      'vite',
      'jest',
      'vitest',
      'pytest',
      'lint',
      'typecheck',
      'build',
      'ci',
      'pipeline',
      '.ts',
      '.tsx',
      '.js',
      '.json',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.rb',
      'git ',
      'pull request',
      'pr ',
    ]);

  if (looksCodey) return 'code';
  return null;
}
