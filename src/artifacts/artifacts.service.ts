import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { StoreService } from '../store/store.service';
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
    private readonly store: StoreService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('BASE_URL', 'http://localhost:4321');
  }

  isValidSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
  }

  async create(html: string, title: string, owner: string): Promise<{ slug: string; url: string }> {
    const slug = randomUUID();
    const meta: ArtifactMeta = {
      slug,
      title: title?.trim() || 'Untitled artifact',
      bytes: Buffer.byteLength(html),
      owner,
    };
    await this.store.writeArtifact(slug, html, meta);
    return { slug, url: `${this.baseUrl}/a/${slug}` };
  }

  has(slug: string): boolean {
    return this.isValidSlug(slug) && this.store.hasArtifact(slug);
  }

  html(slug: string): Promise<string> {
    return this.store.readArtifactHtml(slug);
  }

  meta(slug: string): Promise<ArtifactMeta | null> {
    return this.store.readArtifactMeta<ArtifactMeta>(slug);
  }

  list(): Promise<ArtifactMeta[]> {
    return this.store.listArtifactMetas<ArtifactMeta>();
  }
}
