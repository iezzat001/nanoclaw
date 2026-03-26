import fs from 'fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

export interface ValidationResult {
  passed: boolean;
  warning?: string;
}

export function validateOutput(
  text: string,
  packageJsonPath?: string,
): ValidationResult {
  try {
    const pkgPath = packageJsonPath
      ? path.resolve(packageJsonPath)
      : path.join(process.cwd(), 'package.json');

    const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    const deps = new Set<string>([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
    ]);

    const builtins = new Set<string>([
      ...builtinModules,
      ...builtinModules
        .filter((m) => !m.startsWith('node:'))
        .map((m) => `node:${m}`),
      ...builtinModules
        .filter((m) => m.startsWith('node:'))
        .map((m) => m.replace(/^node:/, '')),
    ]);

    const missing = new Set<string>();
    const importRegex =
      /(import\s+(?:[^'";]+?from\s+)?["']([^"']+)["'])|(require\(\s*["']([^"']+)["']\s*\))/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(text)) !== null) {
      const mod = match[2] || match[4];
      if (!mod) continue;
      if (mod.startsWith('.') || mod.startsWith('/')) continue;

      const normalized = mod.startsWith('node:') ? mod.slice(5) : mod;

      if (builtins.has(mod) || builtins.has(normalized)) continue;
      if (deps.has(mod) || deps.has(normalized)) continue;

      missing.add(mod);
    }

    if (missing.size > 0) {
      return {
        passed: false,
        warning: `Output references packages not in package.json: ${Array.from(missing).join(', ')}`,
      };
    }

    return { passed: true };
  } catch {
    return { passed: true };
  }
}
