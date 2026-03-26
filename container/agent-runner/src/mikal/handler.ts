import {
  defaultMemOSDbPath,
  GLOBAL_MEMCUBE_SLUG,
  MemOS,
  projectMemcubeSlug,
} from './memos.js';
import { extractLatestMessage, stripLeadingTrigger } from './prompt.js';

export interface MikalHandleResult {
  handled: boolean;
  output?: string;
}

export interface MikalHandleOptions {
  assistantName?: string;
  dbPath?: string;
}

function isValidProjectSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

function parseSlashCommand(text: string): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.slice(1).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { name: parts[0]!, args: parts.slice(1) };
}

function looksLikeRemember(text: string): boolean {
  return /^remember\b/i.test(text.trim());
}

function stripRememberPrefix(text: string): string {
  return text.trim().replace(/^remember\b\s*:?/i, '').trim();
}

function looksLikeMainModelQuestion(text: string): boolean {
  const t = text.trim();
  return /\bwhat(?:'s| is)\s+(?:our|the)\s+(?:main|default|primary)\s+model\b/i.test(
    t,
  );
}

function factImpliesGeminiChatPolicy(fact: string): boolean {
  const f = fact.toLowerCase();
  return f.includes('gemini') && (f.includes('chat') || f.includes('conversation'));
}

export function maybeHandleMikal(
  promptXml: string,
  opts: MikalHandleOptions = {},
): MikalHandleResult {
  const latest = extractLatestMessage(promptXml);
  if (!latest) return { handled: false };

  const withoutTrigger = stripLeadingTrigger(latest.text, opts.assistantName);
  const cmd = parseSlashCommand(withoutTrigger);

  const dbPath = opts.dbPath || defaultMemOSDbPath();

  // Slash commands
  if (cmd) {
    const memos = new MemOS({ dbPath });
    try {
      memos.ensureCube(GLOBAL_MEMCUBE_SLUG, 'global');

      if (cmd.name === 'add-memos') {
        return {
          handled: true,
          output: `MemOS initialized (SQLite) at: ${dbPath}`,
        };
      }

      if (cmd.name === 'current-project') {
        const slug = memos.getKV(GLOBAL_MEMCUBE_SLUG, 'current_project');
        if (!slug) {
          return {
            handled: true,
            output:
              'No current project set. Use: /switch-project <slug> [path]',
          };
        }
        const savedPath = memos.getKV(
          GLOBAL_MEMCUBE_SLUG,
          `project:${slug}:path`,
        );
        return {
          handled: true,
          output: savedPath
            ? `Current project: ${slug}\nPath: ${savedPath}`
            : `Current project: ${slug}`,
        };
      }

      if (cmd.name === 'switch-project') {
        const slug = cmd.args[0];
        if (!slug) {
          return {
            handled: true,
            output: 'Usage: /switch-project <slug> [path]',
          };
        }
        if (!isValidProjectSlug(slug)) {
          return {
            handled: true,
            output:
              'Invalid slug. Use lowercase letters, digits, and hyphens only (max 64 chars).',
          };
        }

        const projectCube = projectMemcubeSlug(slug);
        memos.ensureCube(projectCube, 'project');
        memos.setKV(GLOBAL_MEMCUBE_SLUG, 'current_project', slug);

        const projectPath = cmd.args.length > 1 ? cmd.args.slice(1).join(' ') : null;
        if (projectPath) {
          memos.setKV(GLOBAL_MEMCUBE_SLUG, `project:${slug}:path`, projectPath);
        }

        return {
          handled: true,
          output: projectPath
            ? `Switched to project: ${slug}\nPath saved: ${projectPath}`
            : `Switched to project: ${slug}`,
        };
      }

      return { handled: false };
    } finally {
      memos.close();
    }
  }

  // Natural language memory & queries
  if (looksLikeRemember(withoutTrigger) || looksLikeMainModelQuestion(withoutTrigger)) {
    const memos = new MemOS({ dbPath });
    try {
      memos.ensureCube(GLOBAL_MEMCUBE_SLUG, 'global');
      const currentProject = memos.getKV(GLOBAL_MEMCUBE_SLUG, 'current_project');

      if (looksLikeRemember(withoutTrigger)) {
        const fact = stripRememberPrefix(withoutTrigger);
        if (!fact) {
          return {
            handled: true,
            output: 'Tell me what to remember. Example: remember we use Gemini for chat',
          };
        }

        if (factImpliesGeminiChatPolicy(fact)) {
          memos.setKV(GLOBAL_MEMCUBE_SLUG, 'main_model', 'gemini-3-pro-preview');
          memos.appendFact(GLOBAL_MEMCUBE_SLUG, fact, 'user');
          return {
            handled: true,
            output: 'Saved to global memory (main model set).',
          };
        }

        if (currentProject) {
          const projectCube = projectMemcubeSlug(currentProject);
          memos.ensureCube(projectCube, 'project');
          memos.appendFact(projectCube, fact, 'user');
          return {
            handled: true,
            output: `Saved to project memory: ${currentProject}`,
          };
        }

        memos.appendFact(GLOBAL_MEMCUBE_SLUG, fact, 'user');
        return { handled: true, output: 'Saved to global memory.' };
      }

      if (looksLikeMainModelQuestion(withoutTrigger)) {
        const model = memos.getKV(GLOBAL_MEMCUBE_SLUG, 'main_model');
        if (model) {
          return { handled: true, output: `Main model: ${model}` };
        }
        return {
          handled: true,
          output:
            'Main model is not set yet. Tell me: remember we use Gemini for chat',
        };
      }
    } finally {
      memos.close();
    }
  }

  return { handled: false };
}
