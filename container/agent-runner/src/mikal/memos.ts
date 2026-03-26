import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

export type MemCubeType = 'global' | 'project';

export interface MemCube {
  id: number;
  slug: string;
  type: MemCubeType;
  createdAt: string;
}

export interface MemoryFact {
  id: number;
  cubeId: number;
  text: string;
  source: string | null;
  createdAt: string;
}

export const GLOBAL_MEMCUBE_SLUG = 'global-memcube';

export function projectMemcubeSlug(projectSlug: string): string {
  return `project-${projectSlug}`;
}

export function getMemoryCubes(projectSlug?: string): string[] {
  return projectSlug
    ? [GLOBAL_MEMCUBE_SLUG, projectMemcubeSlug(projectSlug)]
    : [GLOBAL_MEMCUBE_SLUG];
}

export interface MemOSOptions {
  dbPath: string;
}

export class MemOS {
  private db: DatabaseSync;

  constructor(opts: MemOSOptions) {
    if (!opts.dbPath) throw new Error('MemOS dbPath is required');

    if (opts.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(opts.dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(opts.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mem_cubes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mem_kv (
        cube_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (cube_id, key),
        FOREIGN KEY (cube_id) REFERENCES mem_cubes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mem_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cube_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        source TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (cube_id) REFERENCES mem_cubes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_mem_facts_cube_created
        ON mem_facts(cube_id, created_at DESC);
    `);
  }

  ensureCube(slug: string, type: MemCubeType): MemCube {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO mem_cubes (slug, type, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(slug) DO NOTHING`,
      )
      .run(slug, type, now);

    const row = this.db
      .prepare(
        `SELECT id, slug, type, created_at
         FROM mem_cubes
         WHERE slug = ?`,
      )
      .get(slug) as
      | { id: number; slug: string; type: string; created_at: string }
      | undefined;

    if (!row) throw new Error(`Failed to ensure cube: ${slug}`);
    if (row.type !== type) {
      // Keep the existing row but surface the mismatch loudly; mixing types breaks isolation.
      throw new Error(
        `Cube type mismatch for ${slug}: expected ${type}, found ${row.type}`,
      );
    }

    return {
      id: row.id,
      slug: row.slug,
      type: row.type as MemCubeType,
      createdAt: row.created_at,
    };
  }

  getCube(slug: string): MemCube | null {
    const row = this.db
      .prepare(
        `SELECT id, slug, type, created_at
         FROM mem_cubes
         WHERE slug = ?`,
      )
      .get(slug) as
      | { id: number; slug: string; type: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      type: row.type as MemCubeType,
      createdAt: row.created_at,
    };
  }

  setKV(cubeSlug: string, key: string, value: string): void {
    const cube = this.getCube(cubeSlug);
    if (!cube) throw new Error(`Cube not found: ${cubeSlug}`);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mem_kv (cube_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cube_id, key)
         DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(cube.id, key, value, now);
  }

  getKV(cubeSlug: string, key: string): string | null {
    const cube = this.getCube(cubeSlug);
    if (!cube) return null;

    const row = this.db
      .prepare(
        `SELECT value
         FROM mem_kv
         WHERE cube_id = ? AND key = ?`,
      )
      .get(cube.id, key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  appendFact(cubeSlug: string, text: string, source?: string): MemoryFact {
    const cube = this.getCube(cubeSlug);
    if (!cube) throw new Error(`Cube not found: ${cubeSlug}`);
    const now = new Date().toISOString();

    const info = this.db
      .prepare(
        `INSERT INTO mem_facts (cube_id, text, source, created_at)
         VALUES (?, ?, ?, ?);`,
      )
      .run(cube.id, text, source ?? null, now);

    const id = Number(info.lastInsertRowid);
    return {
      id,
      cubeId: cube.id,
      text,
      source: source ?? null,
      createdAt: now,
    };
  }

  listFacts(cubeSlug: string, limit = 50): MemoryFact[] {
    const cube = this.getCube(cubeSlug);
    if (!cube) return [];

    const rows = this.db
      .prepare(
        `SELECT id, cube_id, text, source, created_at
         FROM mem_facts
         WHERE cube_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(cube.id, limit) as Array<{
      id: number;
      cube_id: number;
      text: string;
      source: string | null;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      cubeId: r.cube_id,
      text: r.text,
      source: r.source,
      createdAt: r.created_at,
    }));
  }
}

export function defaultMemOSDbPath(): string {
  const home = process.env.HOME || '/home/node';
  return path.join(home, '.claude', 'mikal', 'memos.sqlite');
}
