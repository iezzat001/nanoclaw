import fs from 'fs';
import path from 'node:path';

const PRIMARY_DIR = '/tools/superpowers/skills';
const FALLBACK_DIR = '/tools/superpowers';
const MAX_FILES = 5;
const MAX_CHARS = 3000;

function resolveSkillsDir(): string | null {
  try {
    if (fs.existsSync(PRIMARY_DIR) && fs.statSync(PRIMARY_DIR).isDirectory()) {
      return PRIMARY_DIR;
    }
  } catch {
    return null;
  }

  try {
    if (fs.existsSync(FALLBACK_DIR) && fs.statSync(FALLBACK_DIR).isDirectory()) {
      return FALLBACK_DIR;
    }
  } catch {
    return null;
  }

  return null;
}

export function loadSkills(): string {
  try {
    const dir = resolveSkillsDir();
    if (!dir) return '';

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.md'))
      .sort()
      .slice(0, MAX_FILES);

    let combined = '';

    for (const file of files) {
      if (combined.length >= MAX_CHARS) break;

      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!content) continue;

      const remaining = MAX_CHARS - combined.length;
      combined += content.slice(0, remaining);

      if (combined.length < MAX_CHARS) combined += '\n\n';
    }

    return combined.slice(0, MAX_CHARS).trimEnd();
  } catch {
    return '';
  }
}
