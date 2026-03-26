import path from 'node:path';
import { spawn } from 'node:child_process';

import { validateOutput } from './hallbayes.js';
import { compileContext } from './rlmgw.js';
import { loadSkills } from './superpowers.js';

export const DROID_MODEL_MAP = {
  code: 'gpt-5.1-codex-max',
  analyze: 'claude-opus-4-5-20251101',
  iterate: 'gpt-5.1-codex',
  docs: 'gemini-3-pro-preview',
} as const;

export type DroidTaskType = keyof typeof DROID_MODEL_MAP;

export interface DroidExecOptions {
  model: string;
  prompt: string;
  cwd: string;
  auto?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  maxOutputChars?: number;
}

export async function runDroidExec(opts: DroidExecOptions): Promise<string> {
  const skills = loadSkills();
  const context = await compileContext(opts.prompt, opts.cwd);

  const promptParts: string[] = [];
  const skillsSection = skills.trim();
  if (skillsSection) promptParts.push(`SUPERPOWERS:\n${skillsSection}`);

  const contextSection = context.trim();
  if (contextSection) promptParts.push(`PROJECT CONTEXT:\n${contextSection}`);

  promptParts.push(`TASK:\n${opts.prompt}`);

  const enrichedPrompt = promptParts.join('\n\n');

  const args = [
    'exec',
    '--auto',
    opts.auto ?? 'high',
    '--model',
    opts.model,
    enrichedPrompt,
    '--cwd',
    opts.cwd,
  ];

  const maxChars = opts.maxOutputChars ?? 200_000;

  return await new Promise<string>((resolve, reject) => {
    const child = spawn('droid', args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let combined = '';
    const onChunk = (chunk: Buffer) => {
      if (combined.length >= maxChars) return;
      combined += chunk.toString('utf8');
      if (combined.length > maxChars) {
        combined = combined.slice(0, maxChars) + '\n\n[truncated]\n';
      }
    };

    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`droid exec timed out after ${opts.timeoutMs ?? 900000}ms`));
    }, opts.timeoutMs ?? 900_000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const output = combined.trim();
      if (code === 0) {
        let finalOutput = output || '(droid produced no output)';

        const validation = validateOutput(finalOutput, path.join(opts.cwd, 'package.json'));
        if (!validation.passed && validation.warning) {
          finalOutput = `${finalOutput}\n\n[hallbayes] ${validation.warning}`;
        }

        resolve(finalOutput);
        return;
      }

      reject(
        new Error(
          `droid exec failed (code ${code ?? 'unknown'}): ${output || '(no output)'}`,
        ),
      );
    });
  });
}
