import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email       TEXT PRIMARY KEY,
  salt        TEXT,
  hash        TEXT,
  admin       INTEGER NOT NULL DEFAULT 0,
  api_token   TEXT NOT NULL,
  sso         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  token  TEXT PRIMARY KEY,
  email  TEXT NOT NULL,
  exp    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  owner       TEXT NOT NULL,
  html        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  visibility  TEXT NOT NULL DEFAULT 'public'
);
CREATE TABLE IF NOT EXISTS sessions (
  token  TEXT PRIMARY KEY,
  email  TEXT NOT NULL,
  exp    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state  TEXT PRIMARY KEY,
  next   TEXT NOT NULL DEFAULT '',
  exp    INTEGER NOT NULL
);
`;

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly db: Database.Database;
  private readonly logger = new Logger(DbService.name);

  constructor(config: ConfigService) {
    const dir = config.get<string>('DATA_DIR') || join(process.cwd(), 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, 'lightifact.db');
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this.ensureColumn('oauth_states', 'next', "TEXT NOT NULL DEFAULT ''"); // 기존 DB 마이그레이션
    this.ensureColumn('artifacts', 'visibility', "TEXT NOT NULL DEFAULT 'public'");
    this.logger.log(`SQLite: ${file}`);
  }

  // 컬럼이 없으면 추가 (idempotent 마이그레이션)
  private ensureColumn(table: string, col: string, def: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
