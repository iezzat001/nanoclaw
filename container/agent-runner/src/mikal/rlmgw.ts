import { execFile } from 'node:child_process';

export async function compileContext(prompt: string, cwd: string): Promise<string> {
  try {
    return await new Promise<string>((resolve) => {
      let settled = false;
      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const child = execFile(
        'python3',
        ['/tools/rlmgw/rlmgw.py', '--query', prompt, '--repo', cwd],
        { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
        (error, stdout) => {
          if (error) return finish('');
          finish((stdout ?? '').toString().trim());
        },
      );

      child.on('error', () => finish(''));
    });
  } catch {
    return '';
  }
}
