import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GLOBAL_MEMCUBE_SLUG,
  MemOS,
  getMemoryCubes,
  projectMemcubeSlug,
} from '../container/agent-runner/src/mikal/memos.js';

let tmpDir: string | null = null;

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function makeMemOS(): MemOS {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mikal-memos-'));
  const dbPath = path.join(tmpDir, 'memos.sqlite');
  return new MemOS({ dbPath });
}

describe('MemOS', () => {
  it('returns global + project cube slugs', () => {
    expect(getMemoryCubes()).toEqual([GLOBAL_MEMCUBE_SLUG]);
    expect(getMemoryCubes('calorie-calculator')).toEqual([
      GLOBAL_MEMCUBE_SLUG,
      'project-calorie-calculator',
    ]);
  });

  it('creates cubes and persists KV + facts per cube', () => {
    const memos = makeMemOS();
    try {
      memos.ensureCube(GLOBAL_MEMCUBE_SLUG, 'global');
      memos.setKV(GLOBAL_MEMCUBE_SLUG, 'current_project', 'calorie-calculator');
      expect(memos.getKV(GLOBAL_MEMCUBE_SLUG, 'current_project')).toBe(
        'calorie-calculator',
      );

      const projectCube = projectMemcubeSlug('calorie-calculator');
      memos.ensureCube(projectCube, 'project');

      memos.appendFact(GLOBAL_MEMCUBE_SLUG, 'we use Gemini for chat', 'user');
      memos.appendFact(projectCube, 'use React + TS for UI', 'user');

      const globalFacts = memos.listFacts(GLOBAL_MEMCUBE_SLUG, 10);
      const projectFacts = memos.listFacts(projectCube, 10);

      expect(globalFacts.some((f) => f.text.includes('Gemini'))).toBe(true);
      expect(projectFacts.some((f) => f.text.includes('React'))).toBe(true);
      expect(projectFacts.some((f) => f.text.includes('Gemini'))).toBe(false);
    } finally {
      memos.close();
    }
  });
});
