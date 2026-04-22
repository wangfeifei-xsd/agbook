import { db } from './db.js';
import { id, now, parseJson, stringifyJson } from './util.js';
import type {
  ArcSummary,
  ChapterDraft,
  ChapterPlan,
  ChapterRuleSet,
  ChapterSummary,
  ChapterSummaryEvent,
  ChapterSummaryStateChange,
  CharacterRelation,
  CharacterState,
  DraftVersion,
  ModelProvider,
  NarrativeThread,
  Novel,
  OutlineNode,
  ReviewIssue,
  ReviewReport,
  SettingItem,
  ThreadConfidence,
  ThreadKind,
  ThreadSource,
  ThreadStatus,
} from './types.js';

function rowToNovel(row: any): Novel {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    summary: row.summary,
    targetWordCount: row.target_word_count,
    styleGuide: row.style_guide,
    forbiddenRules: row.forbidden_rules,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSetting(row: any): SettingItem {
  return {
    id: row.id,
    novelId: row.novel_id,
    type: row.type,
    name: row.name,
    summary: row.summary,
    content: row.content,
    tags: parseJson<string[]>(row.tags, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOutline(row: any): OutlineNode {
  return {
    id: row.id,
    novelId: row.novel_id,
    parentId: row.parent_id,
    level: row.level,
    title: row.title,
    summary: row.summary,
    goal: row.goal,
    orderIndex: row.order_index,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPlan(row: any): ChapterPlan {
  return {
    id: row.id,
    novelId: row.novel_id,
    outlineNodeId: row.outline_node_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    summary: row.summary,
    goal: row.goal,
    targetWordCount: row.target_word_count,
    minWordCount: row.min_word_count,
    maxWordCount: row.max_word_count,
    status: row.status,
    ruleSet: parseJson<ChapterRuleSet>(row.rule_set_json, {}),
    contextOverrides: row.context_overrides_json
      ? parseJson(row.context_overrides_json, null) as any
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDraft(row: any): ChapterDraft {
  return {
    id: row.id,
    novelId: row.novel_id,
    chapterPlanId: row.chapter_plan_id,
    currentVersionId: row.current_version_id,
    status: row.status,
    lastGeneratedAt: row.last_generated_at,
    updatedAt: row.updated_at,
  };
}

function rowToVersion(row: any): DraftVersion {
  return {
    id: row.id,
    draftId: row.draft_id,
    versionNumber: row.version_number,
    content: row.content,
    sourceType: row.source_type,
    generationContext: row.generation_context,
    createdAt: row.created_at,
  };
}

function rowToReport(row: any): ReviewReport {
  return {
    id: row.id,
    novelId: row.novel_id,
    chapterPlanId: row.chapter_plan_id,
    draftVersionId: row.draft_version_id,
    result: row.result,
    score: row.score,
    summary: row.summary,
    issues: parseJson<ReviewIssue[]>(row.issues_json, []),
    createdAt: row.created_at,
  };
}

function rowToProvider(row: any): ModelProvider {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    headers: parseJson<Record<string, string>>(row.headers_json, {}),
    isDefault: !!row.is_default,
    isSummarizerDefault: !!row.is_summarizer_default,
    purpose: (row.purpose ?? 'generation') as ModelProvider['purpose'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChapterSummary(row: any): ChapterSummary {
  return {
    id: row.id,
    novelId: row.novel_id,
    chapterPlanId: row.chapter_plan_id,
    draftVersionId: row.draft_version_id,
    brief: row.brief,
    keyEvents: parseJson<ChapterSummaryEvent[]>(row.key_events_json, []),
    stateChanges: parseJson<ChapterSummaryStateChange[]>(row.state_changes_json, []),
    openQuestions: parseJson<string[]>(row.open_questions_json, []),
    raw: row.raw_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToArcSummary(row: any): ArcSummary {
  return {
    id: row.id,
    novelId: row.novel_id,
    title: row.title,
    fromChapter: row.from_chapter,
    toChapter: row.to_chapter,
    chapterPlanIds: parseJson<string[]>(row.chapter_plan_ids_json, []),
    brief: row.brief,
    keyThreads: parseJson<string[]>(row.key_threads_json, []),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToThread(row: any): NarrativeThread {
  return {
    id: row.id,
    novelId: row.novel_id,
    kind: row.kind as ThreadKind,
    label: row.label,
    detail: row.detail,
    introducedAtChapter: row.introduced_at_chapter,
    expectPayoffByChapter: row.expect_payoff_by_chapter,
    resolvedAtChapter: row.resolved_at_chapter,
    status: row.status as ThreadStatus,
    source: row.source as ThreadSource,
    confidence: row.confidence as ThreadConfidence,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCharacterState(row: any): CharacterState {
  return {
    id: row.id,
    novelId: row.novel_id,
    name: row.name,
    settingItemId: row.setting_item_id,
    location: row.location,
    condition: row.condition,
    relations: parseJson<CharacterRelation[]>(row.relations_json, []),
    possessions: parseJson<string[]>(row.possessions_json, []),
    notableFlags: parseJson<string[]>(row.notable_flags_json, []),
    lastUpdatedAtChapter: row.last_updated_at_chapter,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const Novels = {
  list(): Novel[] {
    return db.prepare('SELECT * FROM novels ORDER BY updated_at DESC').all().map(rowToNovel);
  },
  get(id: string): Novel | null {
    const row = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
    return row ? rowToNovel(row) : null;
  },
  create(input: Partial<Novel> & { title: string }): Novel {
    const nid = id();
    const ts = now();
    db.prepare(`INSERT INTO novels
      (id, title, genre, summary, target_word_count, style_guide, forbidden_rules, status, created_at, updated_at)
      VALUES (@id, @title, @genre, @summary, @tw, @style, @forbidden, @status, @ts, @ts)`).run({
      id: nid,
      title: input.title,
      genre: input.genre ?? null,
      summary: input.summary ?? null,
      tw: input.targetWordCount ?? null,
      style: input.styleGuide ?? null,
      forbidden: input.forbiddenRules ?? null,
      status: input.status ?? 'active',
      ts,
    });
    return this.get(nid)!;
  },
  update(id: string, patch: Partial<Novel>): Novel | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE novels SET
      title=@title, genre=@genre, summary=@summary, target_word_count=@tw,
      style_guide=@style, forbidden_rules=@forbidden, status=@status, updated_at=@ts
      WHERE id=@id`).run({
      id,
      title: merged.title,
      genre: merged.genre ?? null,
      summary: merged.summary ?? null,
      tw: merged.targetWordCount ?? null,
      style: merged.styleGuide ?? null,
      forbidden: merged.forbiddenRules ?? null,
      status: merged.status ?? 'active',
      ts: merged.updatedAt,
    });
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM novels WHERE id = ?').run(id);
  },
};

export const Settings = {
  listByNovel(novelId: string): SettingItem[] {
    return db.prepare('SELECT * FROM setting_items WHERE novel_id = ? ORDER BY type, name')
      .all(novelId).map(rowToSetting);
  },
  get(id: string): SettingItem | null {
    const row = db.prepare('SELECT * FROM setting_items WHERE id = ?').get(id);
    return row ? rowToSetting(row) : null;
  },
  create(input: Omit<SettingItem, 'id' | 'createdAt' | 'updatedAt'>): SettingItem {
    const sid = id();
    const ts = now();
    db.prepare(`INSERT INTO setting_items
      (id, novel_id, type, name, summary, content, tags, created_at, updated_at)
      VALUES (@id, @novelId, @type, @name, @summary, @content, @tags, @ts, @ts)`).run({
      id: sid,
      novelId: input.novelId,
      type: input.type,
      name: input.name,
      summary: input.summary ?? null,
      content: input.content ?? null,
      tags: stringifyJson(input.tags ?? []),
      ts,
    });
    return this.get(sid)!;
  },
  update(id: string, patch: Partial<SettingItem>): SettingItem | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE setting_items SET
      type=@type, name=@name, summary=@summary, content=@content, tags=@tags, updated_at=@ts
      WHERE id=@id`).run({
      id,
      type: merged.type,
      name: merged.name,
      summary: merged.summary ?? null,
      content: merged.content ?? null,
      tags: stringifyJson(merged.tags ?? []),
      ts: merged.updatedAt,
    });
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM setting_items WHERE id = ?').run(id);
  },
};

export const Outlines = {
  listByNovel(novelId: string): OutlineNode[] {
    return db.prepare('SELECT * FROM outline_nodes WHERE novel_id = ? ORDER BY order_index')
      .all(novelId).map(rowToOutline);
  },
  get(id: string): OutlineNode | null {
    const row = db.prepare('SELECT * FROM outline_nodes WHERE id = ?').get(id);
    return row ? rowToOutline(row) : null;
  },
  create(input: Omit<OutlineNode, 'id' | 'createdAt' | 'updatedAt'>): OutlineNode {
    const oid = id();
    const ts = now();
    db.prepare(`INSERT INTO outline_nodes
      (id, novel_id, parent_id, level, title, summary, goal, order_index, status, created_at, updated_at)
      VALUES (@id, @novelId, @parentId, @level, @title, @summary, @goal, @orderIndex, @status, @ts, @ts)`).run({
      id: oid,
      novelId: input.novelId,
      parentId: input.parentId ?? null,
      level: input.level,
      title: input.title,
      summary: input.summary ?? null,
      goal: input.goal ?? null,
      orderIndex: input.orderIndex ?? 0,
      status: input.status ?? 'draft',
      ts,
    });
    return this.get(oid)!;
  },
  update(id: string, patch: Partial<OutlineNode>): OutlineNode | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE outline_nodes SET
      parent_id=@parentId, level=@level, title=@title, summary=@summary, goal=@goal,
      order_index=@orderIndex, status=@status, updated_at=@ts WHERE id=@id`).run({
      id,
      parentId: merged.parentId ?? null,
      level: merged.level,
      title: merged.title,
      summary: merged.summary ?? null,
      goal: merged.goal ?? null,
      orderIndex: merged.orderIndex,
      status: merged.status ?? 'draft',
      ts: merged.updatedAt,
    });
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM outline_nodes WHERE id = ?').run(id);
  },
};

export const ChapterPlans = {
  listByNovel(novelId: string): ChapterPlan[] {
    return db.prepare('SELECT * FROM chapter_plans WHERE novel_id = ? ORDER BY chapter_number')
      .all(novelId).map(rowToPlan);
  },
  get(id: string): ChapterPlan | null {
    const row = db.prepare('SELECT * FROM chapter_plans WHERE id = ?').get(id);
    return row ? rowToPlan(row) : null;
  },
  create(input: Omit<ChapterPlan, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
    status?: ChapterPlan['status'];
  }): ChapterPlan {
    const pid = id();
    const ts = now();
    db.prepare(`INSERT INTO chapter_plans
      (id, novel_id, outline_node_id, chapter_number, title, summary, goal,
       target_word_count, min_word_count, max_word_count, status, rule_set_json,
       context_overrides_json, created_at, updated_at)
      VALUES (@id, @novelId, @outlineNodeId, @chapterNumber, @title, @summary, @goal,
       @tw, @minW, @maxW, @status, @ruleSet, @ctx, @ts, @ts)`).run({
      id: pid,
      novelId: input.novelId,
      outlineNodeId: input.outlineNodeId ?? null,
      chapterNumber: input.chapterNumber,
      title: input.title ?? null,
      summary: input.summary ?? null,
      goal: input.goal ?? null,
      tw: input.targetWordCount ?? null,
      minW: input.minWordCount ?? null,
      maxW: input.maxWordCount ?? null,
      status: input.status ?? 'planned',
      ruleSet: stringifyJson(input.ruleSet ?? {}),
      ctx: input.contextOverrides ? stringifyJson(input.contextOverrides) : null,
      ts,
    });
    return this.get(pid)!;
  },
  update(id: string, patch: Partial<ChapterPlan>): ChapterPlan | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE chapter_plans SET
      outline_node_id=@outlineNodeId, chapter_number=@chapterNumber, title=@title,
      summary=@summary, goal=@goal, target_word_count=@tw, min_word_count=@minW,
      max_word_count=@maxW, status=@status, rule_set_json=@ruleSet,
      context_overrides_json=@ctx, updated_at=@ts WHERE id=@id`).run({
      id,
      outlineNodeId: merged.outlineNodeId ?? null,
      chapterNumber: merged.chapterNumber,
      title: merged.title ?? null,
      summary: merged.summary ?? null,
      goal: merged.goal ?? null,
      tw: merged.targetWordCount ?? null,
      minW: merged.minWordCount ?? null,
      maxW: merged.maxWordCount ?? null,
      status: merged.status,
      ruleSet: stringifyJson(merged.ruleSet ?? {}),
      ctx: merged.contextOverrides ? stringifyJson(merged.contextOverrides) : null,
      ts: merged.updatedAt,
    });
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM chapter_plans WHERE id = ?').run(id);
  },
};

export const Drafts = {
  getByPlan(chapterPlanId: string): ChapterDraft | null {
    const row = db.prepare('SELECT * FROM chapter_drafts WHERE chapter_plan_id = ?').get(chapterPlanId);
    return row ? rowToDraft(row) : null;
  },
  getOrCreate(novelId: string, chapterPlanId: string): ChapterDraft {
    const existing = this.getByPlan(chapterPlanId);
    if (existing) return existing;
    const did = id();
    const ts = now();
    db.prepare(`INSERT INTO chapter_drafts (id, novel_id, chapter_plan_id, status, updated_at)
      VALUES (?, ?, ?, 'empty', ?)`).run(did, novelId, chapterPlanId, ts);
    return this.getByPlan(chapterPlanId)!;
  },
  setCurrentVersion(draftId: string, versionId: string, status: ChapterDraft['status']) {
    db.prepare(`UPDATE chapter_drafts SET current_version_id=?, status=?, last_generated_at=?, updated_at=? WHERE id=?`)
      .run(versionId, status, now(), now(), draftId);
  },
  listVersions(draftId: string): DraftVersion[] {
    return db.prepare('SELECT * FROM draft_versions WHERE draft_id = ? ORDER BY version_number DESC')
      .all(draftId).map(rowToVersion);
  },
  getVersion(versionId: string): DraftVersion | null {
    const row = db.prepare('SELECT * FROM draft_versions WHERE id = ?').get(versionId);
    return row ? rowToVersion(row) : null;
  },
  addVersion(input: {
    draftId: string;
    content: string;
    sourceType: DraftVersion['sourceType'];
    generationContext?: string;
  }): DraftVersion {
    const versions = this.listVersions(input.draftId);
    const nextNumber = (versions[0]?.versionNumber ?? 0) + 1;
    const vid = id();
    const ts = now();
    db.prepare(`INSERT INTO draft_versions
      (id, draft_id, version_number, content, source_type, generation_context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      vid,
      input.draftId,
      nextNumber,
      input.content,
      input.sourceType,
      input.generationContext ?? null,
      ts
    );
    return this.getVersion(vid)!;
  },
};

export const Reviews = {
  listByPlan(chapterPlanId: string): ReviewReport[] {
    return db.prepare('SELECT * FROM review_reports WHERE chapter_plan_id = ? ORDER BY created_at DESC')
      .all(chapterPlanId).map(rowToReport);
  },
  get(id: string): ReviewReport | null {
    const row = db.prepare('SELECT * FROM review_reports WHERE id = ?').get(id);
    return row ? rowToReport(row) : null;
  },
  create(input: Omit<ReviewReport, 'id' | 'createdAt'>): ReviewReport {
    const rid = id();
    const ts = now();
    db.prepare(`INSERT INTO review_reports
      (id, novel_id, chapter_plan_id, draft_version_id, result, score, summary, issues_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      rid,
      input.novelId,
      input.chapterPlanId,
      input.draftVersionId,
      input.result,
      input.score ?? null,
      input.summary ?? null,
      stringifyJson(input.issues ?? []),
      ts
    );
    return this.get(rid)!;
  },
};

export const Providers = {
  list(): ModelProvider[] {
    return db.prepare('SELECT * FROM model_providers ORDER BY is_default DESC, created_at DESC')
      .all().map(rowToProvider);
  },
  get(id: string): ModelProvider | null {
    const row = db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id);
    return row ? rowToProvider(row) : null;
  },
  getDefault(): ModelProvider | null {
    const row = db.prepare("SELECT * FROM model_providers WHERE is_default = 1 AND purpose = 'generation' LIMIT 1").get()
      || db.prepare("SELECT * FROM model_providers WHERE purpose = 'generation' ORDER BY created_at DESC LIMIT 1").get()
      || db.prepare('SELECT * FROM model_providers ORDER BY created_at DESC LIMIT 1').get();
    return row ? rowToProvider(row) : null;
  },
  getSummarizer(): ModelProvider | null {
    const row = db.prepare("SELECT * FROM model_providers WHERE purpose = 'summarizer' AND is_summarizer_default = 1 LIMIT 1").get()
      || db.prepare("SELECT * FROM model_providers WHERE purpose = 'summarizer' ORDER BY created_at DESC LIMIT 1").get();
    if (row) return rowToProvider(row);
    return this.getDefault();
  },
  create(input: Omit<ModelProvider, 'id' | 'createdAt' | 'updatedAt'>): ModelProvider {
    const pid = id();
    const ts = now();
    const purpose = input.purpose ?? 'generation';
    if (input.isDefault && purpose === 'generation') {
      db.prepare("UPDATE model_providers SET is_default = 0 WHERE purpose = 'generation'").run();
    }
    if (input.isSummarizerDefault && purpose === 'summarizer') {
      db.prepare("UPDATE model_providers SET is_summarizer_default = 0 WHERE purpose = 'summarizer'").run();
    }
    db.prepare(`INSERT INTO model_providers
      (id, name, base_url, api_key, model, headers_json, is_default, is_summarizer_default, purpose, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      pid,
      input.name,
      input.baseUrl,
      input.apiKey ?? null,
      input.model,
      stringifyJson(input.headers ?? {}),
      input.isDefault ? 1 : 0,
      input.isSummarizerDefault ? 1 : 0,
      purpose,
      ts,
      ts
    );
    return this.get(pid)!;
  },
  update(id: string, patch: Partial<ModelProvider>): ModelProvider | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    if (patch.isDefault && merged.purpose === 'generation') {
      db.prepare("UPDATE model_providers SET is_default = 0 WHERE purpose = 'generation'").run();
    }
    if (patch.isSummarizerDefault && merged.purpose === 'summarizer') {
      db.prepare("UPDATE model_providers SET is_summarizer_default = 0 WHERE purpose = 'summarizer'").run();
    }
    db.prepare(`UPDATE model_providers SET
      name=?, base_url=?, api_key=?, model=?, headers_json=?, is_default=?, is_summarizer_default=?, purpose=?, updated_at=? WHERE id=?`).run(
      merged.name,
      merged.baseUrl,
      merged.apiKey ?? null,
      merged.model,
      stringifyJson(merged.headers ?? {}),
      merged.isDefault ? 1 : 0,
      merged.isSummarizerDefault ? 1 : 0,
      merged.purpose,
      merged.updatedAt,
      id
    );
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM model_providers WHERE id = ?').run(id);
  },
};

export const ChapterSummaries = {
  listByNovel(novelId: string): ChapterSummary[] {
    return db.prepare('SELECT * FROM chapter_summaries WHERE novel_id = ? ORDER BY created_at')
      .all(novelId).map(rowToChapterSummary);
  },
  getByPlan(chapterPlanId: string): ChapterSummary | null {
    const row = db.prepare('SELECT * FROM chapter_summaries WHERE chapter_plan_id = ? ORDER BY updated_at DESC LIMIT 1').get(chapterPlanId);
    return row ? rowToChapterSummary(row) : null;
  },
  getByVersion(draftVersionId: string): ChapterSummary | null {
    const row = db.prepare('SELECT * FROM chapter_summaries WHERE draft_version_id = ?').get(draftVersionId);
    return row ? rowToChapterSummary(row) : null;
  },
  upsertForVersion(input: Omit<ChapterSummary, 'id' | 'createdAt' | 'updatedAt'>): ChapterSummary {
    const ts = now();
    const existing = this.getByVersion(input.draftVersionId);
    if (existing) {
      db.prepare(`UPDATE chapter_summaries SET
        brief = ?, key_events_json = ?, state_changes_json = ?, open_questions_json = ?,
        raw_json = ?, updated_at = ? WHERE id = ?`).run(
        input.brief,
        stringifyJson(input.keyEvents ?? []),
        stringifyJson(input.stateChanges ?? []),
        stringifyJson(input.openQuestions ?? []),
        input.raw ?? null,
        ts,
        existing.id
      );
      return this.getByVersion(input.draftVersionId)!;
    }
    const sid = id();
    db.prepare(`INSERT INTO chapter_summaries
      (id, novel_id, chapter_plan_id, draft_version_id, brief, key_events_json, state_changes_json, open_questions_json, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      sid,
      input.novelId,
      input.chapterPlanId,
      input.draftVersionId,
      input.brief,
      stringifyJson(input.keyEvents ?? []),
      stringifyJson(input.stateChanges ?? []),
      stringifyJson(input.openQuestions ?? []),
      input.raw ?? null,
      ts,
      ts
    );
    return this.getByVersion(input.draftVersionId)!;
  },
  deleteByPlan(chapterPlanId: string): void {
    db.prepare('DELETE FROM chapter_summaries WHERE chapter_plan_id = ?').run(chapterPlanId);
  },
};

export const ArcSummaries = {
  listByNovel(novelId: string): ArcSummary[] {
    return db.prepare('SELECT * FROM arc_summaries WHERE novel_id = ? ORDER BY COALESCE(from_chapter, 0), created_at')
      .all(novelId).map(rowToArcSummary);
  },
  get(id: string): ArcSummary | null {
    const row = db.prepare('SELECT * FROM arc_summaries WHERE id = ?').get(id);
    return row ? rowToArcSummary(row) : null;
  },
  create(input: Omit<ArcSummary, 'id' | 'createdAt' | 'updatedAt'>): ArcSummary {
    const aid = id();
    const ts = now();
    db.prepare(`INSERT INTO arc_summaries
      (id, novel_id, title, from_chapter, to_chapter, chapter_plan_ids_json, brief, key_threads_json, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      aid,
      input.novelId,
      input.title,
      input.fromChapter ?? null,
      input.toChapter ?? null,
      stringifyJson(input.chapterPlanIds ?? []),
      input.brief,
      stringifyJson(input.keyThreads ?? []),
      input.notes ?? null,
      ts,
      ts
    );
    return this.get(aid)!;
  },
  update(id: string, patch: Partial<ArcSummary>): ArcSummary | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE arc_summaries SET
      title=?, from_chapter=?, to_chapter=?, chapter_plan_ids_json=?, brief=?, key_threads_json=?, notes=?, updated_at=? WHERE id=?`).run(
      merged.title,
      merged.fromChapter ?? null,
      merged.toChapter ?? null,
      stringifyJson(merged.chapterPlanIds ?? []),
      merged.brief,
      stringifyJson(merged.keyThreads ?? []),
      merged.notes ?? null,
      merged.updatedAt,
      id
    );
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM arc_summaries WHERE id = ?').run(id);
  },
};

export const Threads = {
  listByNovel(novelId: string, opts?: { status?: ThreadStatus }): NarrativeThread[] {
    if (opts?.status) {
      return db.prepare('SELECT * FROM narrative_threads WHERE novel_id = ? AND status = ? ORDER BY COALESCE(introduced_at_chapter, 0), created_at')
        .all(novelId, opts.status).map(rowToThread);
    }
    return db.prepare('SELECT * FROM narrative_threads WHERE novel_id = ? ORDER BY status, COALESCE(introduced_at_chapter, 0), created_at')
      .all(novelId).map(rowToThread);
  },
  get(id: string): NarrativeThread | null {
    const row = db.prepare('SELECT * FROM narrative_threads WHERE id = ?').get(id);
    return row ? rowToThread(row) : null;
  },
  findByLabel(novelId: string, label: string): NarrativeThread | null {
    const row = db.prepare('SELECT * FROM narrative_threads WHERE novel_id = ? AND label = ? LIMIT 1').get(novelId, label);
    return row ? rowToThread(row) : null;
  },
  create(input: Omit<NarrativeThread, 'id' | 'createdAt' | 'updatedAt'>): NarrativeThread {
    const tid = id();
    const ts = now();
    db.prepare(`INSERT INTO narrative_threads
      (id, novel_id, kind, label, detail, introduced_at_chapter, expect_payoff_by_chapter, resolved_at_chapter, status, source, confidence, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      tid,
      input.novelId,
      input.kind,
      input.label,
      input.detail ?? null,
      input.introducedAtChapter ?? null,
      input.expectPayoffByChapter ?? null,
      input.resolvedAtChapter ?? null,
      input.status ?? 'active',
      input.source ?? 'auto',
      input.confidence ?? 'medium',
      input.notes ?? null,
      ts,
      ts
    );
    return this.get(tid)!;
  },
  update(id: string, patch: Partial<NarrativeThread>): NarrativeThread | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE narrative_threads SET
      kind=?, label=?, detail=?, introduced_at_chapter=?, expect_payoff_by_chapter=?, resolved_at_chapter=?,
      status=?, source=?, confidence=?, notes=?, updated_at=? WHERE id=?`).run(
      merged.kind,
      merged.label,
      merged.detail ?? null,
      merged.introducedAtChapter ?? null,
      merged.expectPayoffByChapter ?? null,
      merged.resolvedAtChapter ?? null,
      merged.status,
      merged.source,
      merged.confidence,
      merged.notes ?? null,
      merged.updatedAt,
      id
    );
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM narrative_threads WHERE id = ?').run(id);
  },
};

export const CharStates = {
  listByNovel(novelId: string): CharacterState[] {
    return db.prepare('SELECT * FROM character_states WHERE novel_id = ? ORDER BY name')
      .all(novelId).map(rowToCharacterState);
  },
  get(id: string): CharacterState | null {
    const row = db.prepare('SELECT * FROM character_states WHERE id = ?').get(id);
    return row ? rowToCharacterState(row) : null;
  },
  findByName(novelId: string, name: string): CharacterState | null {
    const row = db.prepare('SELECT * FROM character_states WHERE novel_id = ? AND name = ? LIMIT 1').get(novelId, name);
    return row ? rowToCharacterState(row) : null;
  },
  upsertByName(input: Omit<CharacterState, 'id' | 'createdAt' | 'updatedAt'>): CharacterState {
    const ts = now();
    const existing = this.findByName(input.novelId, input.name);
    if (existing) {
      db.prepare(`UPDATE character_states SET
        setting_item_id=?, location=?, condition=?, relations_json=?, possessions_json=?, notable_flags_json=?,
        last_updated_at_chapter=?, notes=?, updated_at=? WHERE id=?`).run(
        input.settingItemId ?? existing.settingItemId ?? null,
        input.location ?? existing.location ?? null,
        input.condition ?? existing.condition ?? null,
        stringifyJson(input.relations ?? existing.relations ?? []),
        stringifyJson(input.possessions ?? existing.possessions ?? []),
        stringifyJson(input.notableFlags ?? existing.notableFlags ?? []),
        input.lastUpdatedAtChapter ?? existing.lastUpdatedAtChapter ?? null,
        input.notes ?? existing.notes ?? null,
        ts,
        existing.id
      );
      return this.get(existing.id)!;
    }
    const cid = id();
    db.prepare(`INSERT INTO character_states
      (id, novel_id, name, setting_item_id, location, condition, relations_json, possessions_json, notable_flags_json, last_updated_at_chapter, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      cid,
      input.novelId,
      input.name,
      input.settingItemId ?? null,
      input.location ?? null,
      input.condition ?? null,
      stringifyJson(input.relations ?? []),
      stringifyJson(input.possessions ?? []),
      stringifyJson(input.notableFlags ?? []),
      input.lastUpdatedAtChapter ?? null,
      input.notes ?? null,
      ts,
      ts
    );
    return this.get(cid)!;
  },
  update(id: string, patch: Partial<CharacterState>): CharacterState | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, updatedAt: now() };
    db.prepare(`UPDATE character_states SET
      name=?, setting_item_id=?, location=?, condition=?, relations_json=?, possessions_json=?, notable_flags_json=?,
      last_updated_at_chapter=?, notes=?, updated_at=? WHERE id=?`).run(
      merged.name,
      merged.settingItemId ?? null,
      merged.location ?? null,
      merged.condition ?? null,
      stringifyJson(merged.relations ?? []),
      stringifyJson(merged.possessions ?? []),
      stringifyJson(merged.notableFlags ?? []),
      merged.lastUpdatedAtChapter ?? null,
      merged.notes ?? null,
      merged.updatedAt,
      id
    );
    return this.get(id);
  },
  delete(id: string): void {
    db.prepare('DELETE FROM character_states WHERE id = ?').run(id);
  },
};
