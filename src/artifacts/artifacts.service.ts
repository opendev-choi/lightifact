import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { ArtifactMeta } from '../common/types';

// artifact HTML 은 외부 네트워크를 못 쓰게 막는다 (Claude Artifacts 와 동일 철학).
export const RAW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

const SLUG_RE = /^[a-zA-Z0-9-]{6,64}$/;

@Injectable()
export class ArtifactsService {
  private readonly baseUrl: string;
  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('BASE_URL', 'http://localhost:4321');
  }

  private get sql() {
    return this.db.db;
  }

  isValidSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
  }

  shareUrl(slug: string): string {
    return `${this.baseUrl}/a/${slug}`;
  }

  create(html: string, title: string, owner: string): { slug: string; url: string } {
    const slug = randomUUID();
    this.sql
      .prepare('INSERT INTO artifacts (slug, title, owner, html, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, title?.trim() || 'Untitled artifact', owner, html, Buffer.byteLength(html), Date.now());
    return { slug, url: `${this.baseUrl}/a/${slug}` };
  }

  has(slug: string): boolean {
    if (!this.isValidSlug(slug)) return false;
    return !!this.sql.prepare('SELECT 1 FROM artifacts WHERE slug = ?').get(slug);
  }

  html(slug: string): string | null {
    const row = this.sql.prepare('SELECT html FROM artifacts WHERE slug = ?').get(slug) as { html: string } | undefined;
    return row?.html ?? null;
  }

  meta(slug: string): ArtifactMeta | null {
    if (!this.isValidSlug(slug)) return null;
    const row = this.sql.prepare('SELECT slug, title, owner, bytes FROM artifacts WHERE slug = ?').get(slug) as ArtifactMeta | undefined;
    return row ?? null;
  }

  list(opts: { owner?: string; limit: number; offset: number }): ArtifactMeta[] {
    if (opts.owner) {
      return this.sql
        .prepare('SELECT slug, title, owner, bytes FROM artifacts WHERE owner = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(opts.owner, opts.limit, opts.offset) as ArtifactMeta[];
    }
    return this.sql
      .prepare('SELECT slug, title, owner, bytes FROM artifacts ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(opts.limit, opts.offset) as ArtifactMeta[];
  }

  count(owner?: string): number {
    const row = owner
      ? this.sql.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE owner = ?').get(owner)
      : this.sql.prepare('SELECT COUNT(*) AS n FROM artifacts').get();
    return (row as { n: number }).n;
  }

  delete(slug: string): void {
    this.sql.prepare('DELETE FROM artifacts WHERE slug = ?').run(slug);
  }

  // 덮어쓰기 (slug·owner·created_at 유지, html/title 갱신)
  update(slug: string, html: string, title: string): void {
    this.sql
      .prepare('UPDATE artifacts SET html = ?, bytes = ?, title = ? WHERE slug = ?')
      .run(html, Buffer.byteLength(html), title, slug);
  }
}
