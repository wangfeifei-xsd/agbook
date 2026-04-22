import Database from 'better-sqlite3';
import { DB_FILE, ensureDirs } from './config.js';

ensureDirs();

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT,
      summary TEXT,
      target_word_count INTEGER,
      style_guide TEXT,
      forbidden_rules TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setting_items (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS outline_nodes (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      parent_id TEXT,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      goal TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_plans (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      outline_node_id TEXT,
      chapter_number INTEGER NOT NULL,
      title TEXT,
      summary TEXT,
      goal TEXT,
      target_word_count INTEGER,
      min_word_count INTEGER,
      max_word_count INTEGER,
      status TEXT DEFAULT 'planned',
      rule_set_json TEXT,
      context_overrides_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_drafts (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_plan_id TEXT NOT NULL,
      current_version_id TEXT,
      status TEXT DEFAULT 'empty',
      last_generated_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_plan_id) REFERENCES chapter_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS draft_versions (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL,
      generation_context TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES chapter_drafts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS review_reports (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_plan_id TEXT NOT NULL,
      draft_version_id TEXT NOT NULL,
      result TEXT NOT NULL,
      score INTEGER,
      summary TEXT,
      issues_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS model_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT,
      model TEXT NOT NULL,
      headers_json TEXT,
      is_default INTEGER DEFAULT 0,
      purpose TEXT NOT NULL DEFAULT 'generation',
      is_summarizer_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapter_summaries (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_plan_id TEXT NOT NULL,
      draft_version_id TEXT NOT NULL,
      brief TEXT NOT NULL,
      key_events_json TEXT,
      state_changes_json TEXT,
      open_questions_json TEXT,
      raw_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_plan_id) REFERENCES chapter_plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chapter_summaries_plan ON chapter_summaries(chapter_plan_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_summaries_novel ON chapter_summaries(novel_id);

    CREATE TABLE IF NOT EXISTS arc_summaries (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      from_chapter INTEGER,
      to_chapter INTEGER,
      chapter_plan_ids_json TEXT,
      brief TEXT NOT NULL,
      key_threads_json TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS narrative_threads (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      detail TEXT,
      introduced_at_chapter INTEGER,
      expect_payoff_by_chapter INTEGER,
      resolved_at_chapter INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'auto',
      confidence TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_threads_novel_status ON narrative_threads(novel_id, status);

    CREATE TABLE IF NOT EXISTS character_states (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      setting_item_id TEXT,
      location TEXT,
      condition TEXT,
      relations_json TEXT,
      possessions_json TEXT,
      notable_flags_json TEXT,
      last_updated_at_chapter INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_char_states_novel_name ON character_states(novel_id, name);
  `);

  ensureColumn('model_providers', 'purpose', "purpose TEXT NOT NULL DEFAULT 'generation'");
  ensureColumn('model_providers', 'is_summarizer_default', 'is_summarizer_default INTEGER DEFAULT 0');
  ensureColumn('chapter_plans', 'context_overrides_json', 'context_overrides_json TEXT');
}
