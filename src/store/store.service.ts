import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 무DB 저장소: PVC(DATA_DIR)의 JSON/HTML 파일.
// - users.json / invites.json / settings.json : 앱 상태 (JSON)
// - <slug>.html + <slug>.json : artifact 본문/메타
@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);
  readonly dataDir: string;

  constructor(config: ConfigService) {
    const fromEnv = config.get<string>('DATA_DIR');
    this.dataDir = fromEnv || join(process.cwd(), 'data');
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
  }

  private path(name: string): string {
    return join(this.dataDir, name);
  }

  readJson<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(this.path(name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  writeJson(name: string, value: unknown): void {
    writeFileSync(this.path(name), JSON.stringify(value, null, 2), 'utf8');
  }

  // ── artifact 파일 ──
  async writeArtifact(slug: string, html: string, meta: unknown): Promise<void> {
    await writeFile(this.path(`${slug}.html`), html, 'utf8');
    await writeFile(this.path(`${slug}.json`), JSON.stringify(meta), 'utf8');
  }

  hasArtifact(slug: string): boolean {
    return existsSync(this.path(`${slug}.html`));
  }

  async readArtifactHtml(slug: string): Promise<string> {
    return readFile(this.path(`${slug}.html`), 'utf8');
  }

  async readArtifactMeta<T>(slug: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.path(`${slug}.json`), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  async listArtifactMetas<T>(): Promise<T[]> {
    const reserved = new Set(['users.json', 'invites.json', 'settings.json']);
    const files = (await readdir(this.dataDir)).filter(
      (f) => f.endsWith('.json') && !reserved.has(f),
    );
    const out: T[] = [];
    for (const f of files) {
      try {
        out.push(JSON.parse(await readFile(join(this.dataDir, f), 'utf8')) as T);
      } catch {
        /* skip corrupt */
      }
    }
    return out;
  }
}
