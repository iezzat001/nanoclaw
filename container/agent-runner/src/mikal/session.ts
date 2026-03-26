import fs from 'fs';

import { DROID_MODEL_MAP, runDroidExec } from './droid.js';
import { geminiGenerateText, type GeminiContent } from './gemini.js';
import { maybeHandleMikal } from './handler.js';
import {
  defaultMemOSDbPath,
  GLOBAL_MEMCUBE_SLUG,
  MemOS,
  projectMemcubeSlug,
} from './memos.js';
import { parseMessages, stripLeadingTrigger } from './prompt.js';
import { detectDroidTaskType } from './routing.js';

export interface MikalSessionOptions {
  assistantName?: string;
  dbPath?: string;
  geminiModel?: string;
}

export class MikalSession {
  private history: GeminiContent[] = [];
  private assistantName?: string;
  private dbPath: string;
  private geminiModel: string;

  constructor(opts: MikalSessionOptions = {}) {
    this.assistantName = opts.assistantName;
    this.dbPath = opts.dbPath || defaultMemOSDbPath();
    this.geminiModel = opts.geminiModel || 'gemini-3-pro-preview';
  }

  async handlePrompt(promptXml: string): Promise<string> {
    const msgs = parseMessages(promptXml);
    const newUserTexts = msgs
      .map((m) => stripLeadingTrigger(m.text, this.assistantName).trim())
      .filter(Boolean);

    for (const text of newUserTexts) {
      this.history.push({ role: 'user', parts: [{ text }] });
    }

    // Hard cap history to keep requests bounded.
    if (this.history.length > 60) {
      this.history = this.history.slice(-60);
    }

    const mikal = maybeHandleMikal(promptXml, {
      assistantName: this.assistantName,
      dbPath: this.dbPath,
    });
    if (mikal.handled) {
      const out = (mikal.output || '').trim();
      if (out) this.history.push({ role: 'model', parts: [{ text: out }] });
      return out || '(ok)';
    }

    const latestText = newUserTexts[newUserTexts.length - 1] || '';
    const taskType = detectDroidTaskType(latestText);

    const memos = new MemOS({ dbPath: this.dbPath });
    try {
      memos.ensureCube(GLOBAL_MEMCUBE_SLUG, 'global');
      const currentProject = memos.getKV(GLOBAL_MEMCUBE_SLUG, 'current_project');
      const systemInstruction = buildSystemInstruction(memos, currentProject);

      if (taskType) {
        const cwd = resolveDroidCwd(memos, currentProject);
        const droidPrompt = buildDroidPrompt(latestText, systemInstruction);
        let output: string;
        try {
          output = await runDroidExec({
            model: DROID_MODEL_MAP[taskType],
            prompt: droidPrompt,
            cwd,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output = `Droid failed: ${msg}`;
        }

        // Keep conversation continuity; don't let droid spam blow up history.
        this.history.push({
          role: 'model',
          parts: [{ text: output.slice(0, 8000) }],
        });

        return output;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        const msg =
          'Gemini is not configured. Set GEMINI_API_KEY in NanoClaw\'s environment (and rebuild/restart) to enable chat.';
        this.history.push({ role: 'model', parts: [{ text: msg }] });
        return msg;
      }

      let reply: string;
      try {
        reply = await geminiGenerateText({
          apiKey,
          model: this.geminiModel,
          contents: this.history,
          systemInstruction,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reply = `Gemini failed: ${msg}`;
      }

      this.history.push({ role: 'model', parts: [{ text: reply }] });
      return reply;
    } finally {
      memos.close();
    }
  }
}

function buildSystemInstruction(memos: MemOS, currentProject: string | null): string {
  const globalFacts = memos.listFacts(GLOBAL_MEMCUBE_SLUG, 25).map((f) => f.text);
  const projectFacts = currentProject
    ? memos.listFacts(projectMemcubeSlug(currentProject), 25).map((f) => f.text)
    : [];

  const lines: string[] = [];
  lines.push('You are Mikal.');
  lines.push('Use the persistent memory facts below as user preferences and project context.');
  lines.push('If memory conflicts with the user\'s explicit instruction, ask for clarification.');
  lines.push('');

  lines.push('Persistent memory (global):');
  if (globalFacts.length === 0) lines.push('- (none)');
  else for (const f of globalFacts) lines.push(`- ${f}`);
  lines.push('');

  lines.push(`Current project: ${currentProject || '(none)'}`);
  if (currentProject) {
    lines.push('Persistent memory (project):');
    if (projectFacts.length === 0) lines.push('- (none)');
    else for (const f of projectFacts) lines.push(`- ${f}`);
  }

  return lines.join('\n');
}

function resolveDroidCwd(memos: MemOS, currentProject: string | null): string {
  const defaultCwd = fs.existsSync('/workspace/project')
    ? '/workspace/project'
    : '/workspace/group';
  if (!currentProject) return defaultCwd;
  const savedPath = memos.getKV(GLOBAL_MEMCUBE_SLUG, `project:${currentProject}:path`);
  if (!savedPath) return defaultCwd;
  if (!fs.existsSync(savedPath)) return defaultCwd;
  return savedPath;
}

function buildDroidPrompt(userTask: string, systemInstruction: string): string {
  return [
    'SYSTEM / POLICY:',
    systemInstruction,
    '',
    'TASK:',
    userTask,
    '',
    'CONSTRAINTS:',
    '- Return a concise summary of what you did (no raw code dumps unless asked).',
    '- If you need to run commands, run them and report results.',
    '- Do not assume dependencies exist; verify first.',
  ].join('\n');
}
