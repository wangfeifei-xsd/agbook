import { chatCompletion } from '../providers/openai.js';
import {
  ArcSummaries,
  ChapterPlans,
  ChapterSummaries,
  CharStates,
  Drafts,
  Novels,
  Providers,
  Settings,
  Threads,
} from '../repo.js';
import type {
  ArcSummary,
  ChapterPlan,
  ChapterSummary,
  ModelProvider,
  NarrativeThread,
  Novel,
  ThreadKind,
} from '../types.js';

// ---------- Prompt schema ----------

const CHAPTER_SUMMARY_INSTRUCTIONS = `你是一名严谨的小说编辑助手，负责把刚生成的章节正文转成结构化"故事档案"。
目标：为后续章节生成提供准确、稳定、可追溯的记忆，包括本章发生的事、人物状态变化、新埋或回收的伏笔/悬念。

输出要求：
1. 严格输出合法 JSON，**不要**包含 Markdown 代码块、前言、解释或额外文字。
2. 字段缺失时用 [] 或 ""；不要编造章节正文里没有的内容。
3. brief：80-180 字的中文概括，作为长程上下文使用。避免照抄原文。
4. key_events：最多 8 条，按时间/剧情顺序。
5. state_changes：涉及角色、势力、重要物品的显著变化。每条简短一句。
6. open_questions：本章结束时仍未揭示或悬而未决的点。
7. thread_updates.new：本章**新**埋下的伏笔 / 承诺 / 悬念。label 要短且唯一（8 字以内），detail 描述内容与预期回收方向。
   - kind ∈ ["foreshadow","subplot","promise","mystery"]
   - expect_payoff_by_chapter 是可选整数，若本章没暗示可填 null。
8. thread_updates.resolved：本章**回收**的伏笔 / 悬念。label 必须和已存在的伏笔 label 完全匹配（见下方【已有伏笔】）。
9. thread_updates.updated：仅当旧伏笔有新进展时填写；label 同上。
10. character_updates：列出本章发生可感知状态变化的角色。
   - name 严格使用人物的正式名字（不要昵称混用）。
   - location / condition 为"当前"状态（章末时）；若本章没变化可留空字符串 ""。
   - relations_delta 只列**本章新增或发生变化**的关系，格式 [{target, relation}]。
   - possessions_delta 本章获得/失去的重要物品：用 "+信物" 表示获得，"-信物" 表示失去。
   - notable_flags_delta 本章新增的显著标签（如 "受伤","黑化","晋升"）。

JSON 结构：
{
  "chapter_summary": {
    "brief": "...",
    "key_events": [{"who":"...","what":"...","where":"...","when":"..."}],
    "state_changes": [{"target":"...","change":"..."}],
    "open_questions": ["..."]
  },
  "thread_updates": {
    "new": [{"kind":"foreshadow","label":"...","detail":"...","expect_payoff_by_chapter":null}],
    "resolved": [{"label":"...","note":"..."}],
    "updated": [{"label":"...","detail_append":"..."}]
  },
  "character_updates": [
    {"name":"...","location":"...","condition":"...","relations_delta":[{"target":"...","relation":"..."}],"possessions_delta":[],"notable_flags_delta":[]}
  ]
}`;

const ARC_SUMMARY_INSTRUCTIONS = `你是一名小说编辑助手。请把以下若干章节的结构化摘要，归纳为一段更高层的"卷/弧"摘要，用于后续几十章生成时作为长程记忆。

输出要求：
1. 严格输出合法 JSON，不要 Markdown 或额外文字。
2. brief：300-600 字中文总括，涵盖主线推进、主要冲突、核心人物弧光、世界观新增信息。
3. key_threads：最多 10 条字符串，每条是一句话，提炼本弧关键线索/伏笔/悬念，供后续章节回看。

JSON 结构：
{ "brief": "...", "key_threads": ["..."] }`;

// ---------- Helpers ----------

function safeJsonExtract(raw: string): any {
  const trimmed = raw.trim();
  // Strip Markdown code fences if the model didn't listen.
  let s = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('摘要模型输出里找不到 JSON 对象');
  }
  s = s.slice(first, last + 1);
  return JSON.parse(s);
}

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: any): string {
  return typeof v === 'string' ? v : '';
}

function clampText(v: any, max: number): string {
  const s = asString(v);
  return s.length > max ? s.slice(0, max) : s;
}

function pickSummarizerProvider(override?: string | null): ModelProvider {
  if (override) {
    const p = Providers.get(override);
    if (p) return p;
  }
  const p = Providers.getSummarizer();
  if (!p) throw new Error('未配置可用于摘要的模型。请在「模型配置」里添加一个 Provider，并可选把用途设为 summarizer。');
  return p;
}

// ---------- Public API ----------

export interface SummarizeChapterOptions {
  providerId?: string | null;
  temperature?: number;
  versionId?: string;
}

export interface SummarizeChapterResult {
  summary: ChapterSummary;
  threadsCreated: number;
  threadsResolved: number;
  threadsUpdated: number;
  charactersTouched: number;
  raw: string;
}

export async function summarizeChapter(
  chapterPlanId: string,
  opts: SummarizeChapterOptions = {}
): Promise<SummarizeChapterResult> {
  const plan = ChapterPlans.get(chapterPlanId);
  if (!plan) throw new Error('章节计划不存在');
  const novel = Novels.get(plan.novelId);
  if (!novel) throw new Error('小说不存在');

  const draft = Drafts.getByPlan(plan.id);
  const targetVersionId = opts.versionId ?? draft?.currentVersionId ?? null;
  if (!targetVersionId) throw new Error('该章节暂无已生成/保存的正文版本');
  const version = Drafts.getVersion(targetVersionId);
  if (!version || !version.content.trim()) throw new Error('章节正文为空，无法摘要');

  const provider = pickSummarizerProvider(opts.providerId);

  const existingThreads = Threads.listByNovel(novel.id, { status: 'active' });
  const existingChars = CharStates.listByNovel(novel.id);

  const activeThreadsBlock = existingThreads.length
    ? existingThreads
        .slice(0, 40)
        .map(t => `- [${t.kind}] ${t.label}：${clampText(t.detail, 120)}${t.expectPayoffByChapter ? `（预期第 ${t.expectPayoffByChapter} 章回收）` : ''}`)
        .join('\n')
    : '（暂无）';

  const characterBlock = existingChars.length
    ? existingChars
        .slice(0, 30)
        .map(c => {
          const flags = (c.notableFlags ?? []).slice(0, 5).join('、');
          return `- ${c.name}｜位置:${c.location || '—'}｜状态:${c.condition || '—'}${flags ? `｜标签:${flags}` : ''}`;
        })
        .join('\n')
    : '（暂无，可按本章情节新建）';

  const user = [
    `【小说】《${novel.title}》${novel.genre ? `（${novel.genre}）` : ''}`,
    `【当前章节】第 ${plan.chapterNumber} 章${plan.title ? `·${plan.title}` : ''}`,
    '',
    '【已有伏笔/悬念（供回收/更新时引用 label）】',
    activeThreadsBlock,
    '',
    '【已有角色状态】',
    characterBlock,
    '',
    '【本章正文】',
    version.content,
    '',
    '请严格按照 system 中给出的 JSON 结构输出。',
  ].join('\n');

  const raw = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: CHAPTER_SUMMARY_INSTRUCTIONS },
      { role: 'user', content: user },
    ],
    temperature: opts.temperature ?? 0.3,
    timeoutMs: 240_000,
    maxRetries: 2,
    retryBaseMs: 2000,
  });

  const parsed = safeJsonExtract(raw);

  // --- chapter_summary ---
  const cs = parsed.chapter_summary ?? {};
  const brief = clampText(cs.brief, 600) || clampText(version.content.slice(0, 200), 200);
  const keyEvents = asArray(cs.key_events).map((e: any) => ({
    who: asString(e?.who) || undefined,
    what: clampText(e?.what, 160),
    where: asString(e?.where) || undefined,
    when: asString(e?.when) || undefined,
  })).filter(e => e.what);
  const stateChanges = asArray(cs.state_changes).map((x: any) => ({
    target: clampText(x?.target, 40),
    change: clampText(x?.change, 200),
  })).filter(x => x.target && x.change);
  const openQuestions = asArray<string>(cs.open_questions).map(s => clampText(s, 200)).filter(Boolean);

  const summary = ChapterSummaries.upsertForVersion({
    novelId: novel.id,
    chapterPlanId: plan.id,
    draftVersionId: version.id,
    brief,
    keyEvents,
    stateChanges,
    openQuestions,
    raw,
  });

  // --- threads ---
  const tu = parsed.thread_updates ?? {};
  const newThreadDefs = asArray(tu.new);
  const resolvedDefs = asArray(tu.resolved);
  const updatedDefs = asArray(tu.updated);

  let threadsCreated = 0;
  let threadsResolved = 0;
  let threadsUpdated = 0;

  for (const def of newThreadDefs) {
    const label = clampText(def?.label, 40);
    if (!label) continue;
    const existing = Threads.findByLabel(novel.id, label);
    if (existing) {
      Threads.update(existing.id, {
        detail: def?.detail ? clampText(def.detail, 400) : existing.detail,
        expectPayoffByChapter: typeof def?.expect_payoff_by_chapter === 'number'
          ? def.expect_payoff_by_chapter
          : existing.expectPayoffByChapter,
        status: 'active',
      });
      threadsUpdated += 1;
      continue;
    }
    const kind = (['foreshadow', 'subplot', 'promise', 'mystery'] as ThreadKind[])
      .includes(def?.kind) ? (def.kind as ThreadKind) : 'foreshadow';
    Threads.create({
      novelId: novel.id,
      kind,
      label,
      detail: clampText(def?.detail, 400),
      introducedAtChapter: plan.chapterNumber,
      expectPayoffByChapter: typeof def?.expect_payoff_by_chapter === 'number' ? def.expect_payoff_by_chapter : null,
      resolvedAtChapter: null,
      status: 'active',
      source: 'auto',
      confidence: 'medium',
    });
    threadsCreated += 1;
  }

  for (const def of resolvedDefs) {
    const label = clampText(def?.label, 40);
    if (!label) continue;
    const t = Threads.findByLabel(novel.id, label);
    if (!t) continue;
    Threads.update(t.id, {
      status: 'resolved',
      resolvedAtChapter: plan.chapterNumber,
      notes: def?.note ? clampText(def.note, 200) : t.notes,
    });
    threadsResolved += 1;
  }

  for (const def of updatedDefs) {
    const label = clampText(def?.label, 40);
    if (!label) continue;
    const t = Threads.findByLabel(novel.id, label);
    if (!t) continue;
    const appended = def?.detail_append ? clampText(def.detail_append, 200) : '';
    Threads.update(t.id, {
      detail: appended ? `${t.detail ?? ''}\n[第${plan.chapterNumber}章] ${appended}`.trim() : t.detail,
    });
    threadsUpdated += 1;
  }

  // --- character updates ---
  const charDefs = asArray(parsed.character_updates);
  let charactersTouched = 0;

  const allSettings = Settings.listByNovel(novel.id);
  const charSettingMap = new Map(
    allSettings.filter(s => s.type === 'character').map(s => [s.name.trim(), s.id])
  );

  for (const def of charDefs) {
    const name = clampText(def?.name, 40);
    if (!name) continue;
    const existing = CharStates.findByName(novel.id, name);
    const relationsDelta = asArray(def?.relations_delta).map((r: any) => ({
      target: clampText(r?.target, 40),
      relation: clampText(r?.relation, 80),
    })).filter(r => r.target && r.relation);

    const possessionsDelta = asArray<string>(def?.possessions_delta).map(s => clampText(s, 40)).filter(Boolean);
    const flagsDelta = asArray<string>(def?.notable_flags_delta).map(s => clampText(s, 40)).filter(Boolean);

    const mergedRelations = [...(existing?.relations ?? [])];
    for (const r of relationsDelta) {
      const idx = mergedRelations.findIndex(x => x.target === r.target);
      if (idx >= 0) mergedRelations[idx] = r;
      else mergedRelations.push(r);
    }

    let mergedPossessions = [...(existing?.possessions ?? [])];
    for (const p of possessionsDelta) {
      if (p.startsWith('-')) {
        const name2 = p.slice(1).trim();
        mergedPossessions = mergedPossessions.filter(x => x !== name2);
      } else {
        const name2 = p.startsWith('+') ? p.slice(1).trim() : p.trim();
        if (name2 && !mergedPossessions.includes(name2)) mergedPossessions.push(name2);
      }
    }

    const mergedFlags = [...(existing?.notableFlags ?? [])];
    for (const f of flagsDelta) {
      if (!mergedFlags.includes(f)) mergedFlags.push(f);
    }

    const loc = asString(def?.location);
    const cond = asString(def?.condition);

    CharStates.upsertByName({
      novelId: novel.id,
      name,
      settingItemId: charSettingMap.get(name) ?? existing?.settingItemId ?? null,
      location: loc || existing?.location || null,
      condition: cond || existing?.condition || null,
      relations: mergedRelations,
      possessions: mergedPossessions,
      notableFlags: mergedFlags,
      lastUpdatedAtChapter: plan.chapterNumber,
      notes: existing?.notes ?? null,
    });
    charactersTouched += 1;
  }

  return { summary, threadsCreated, threadsResolved, threadsUpdated, charactersTouched, raw };
}

export interface SummarizeArcOptions {
  title: string;
  chapterPlanIds: string[];
  providerId?: string | null;
  notes?: string | null;
}

export async function summarizeArc(
  novelId: string,
  opts: SummarizeArcOptions
): Promise<ArcSummary> {
  const novel = Novels.get(novelId);
  if (!novel) throw new Error('小说不存在');
  if (!opts.chapterPlanIds?.length) throw new Error('至少选择一个章节');

  const plans = opts.chapterPlanIds
    .map(id => ChapterPlans.get(id))
    .filter((x): x is ChapterPlan => !!x && x.novelId === novelId);
  if (!plans.length) throw new Error('未找到有效章节');
  plans.sort((a, b) => a.chapterNumber - b.chapterNumber);

  const summaries: ChapterSummary[] = [];
  for (const p of plans) {
    const s = ChapterSummaries.getByPlan(p.id);
    if (s) summaries.push(s);
  }
  if (!summaries.length) throw new Error('所选章节尚无单章摘要，请先对每章执行摘要。');

  const provider = pickSummarizerProvider(opts.providerId);

  const blocks = summaries.map(s => {
    const plan = plans.find(p => p.id === s.chapterPlanId)!;
    const events = (s.keyEvents ?? []).map(e => `  - ${e.what}`).join('\n');
    const questions = (s.openQuestions ?? []).map(q => `  - ${q}`).join('\n');
    return [
      `### 第 ${plan.chapterNumber} 章 ${plan.title ?? ''}`,
      `brief: ${s.brief}`,
      events ? `key_events:\n${events}` : '',
      questions ? `open_questions:\n${questions}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const user = [
    `【小说】《${novel.title}》${novel.genre ? `（${novel.genre}）` : ''}`,
    `【弧名】${opts.title}`,
    '',
    '【章节摘要列表】',
    blocks,
    '',
    '请按 system 中的 JSON 结构输出。',
  ].join('\n');

  const raw = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: ARC_SUMMARY_INSTRUCTIONS },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    // 归纳任务耗时长、上游网关（如 nginx 默认 60s）容易 504，这里放宽
    timeoutMs: 300_000,
    maxRetries: 3,
    retryBaseMs: 3000,
  });

  const parsed = safeJsonExtract(raw);
  const brief = clampText(parsed.brief, 2000);
  const keyThreads = asArray<string>(parsed.key_threads).map(s => clampText(s, 160)).filter(Boolean);

  return ArcSummaries.create({
    novelId: novel.id,
    title: opts.title,
    fromChapter: plans[0].chapterNumber,
    toChapter: plans[plans.length - 1].chapterNumber,
    chapterPlanIds: plans.map(p => p.id),
    brief,
    keyThreads,
    notes: opts.notes ?? null,
  });
}

// Re-export pickSummarizerProvider for debugging in routes if needed.
export { pickSummarizerProvider };

/** Infer active threads relevant to the upcoming chapter. */
export function pickRelevantThreads(
  novelId: string,
  upcomingChapter: number,
  maxCount = 12
): NarrativeThread[] {
  const active = Threads.listByNovel(novelId, { status: 'active' });
  if (!active.length) return [];

  active.sort((a, b) => {
    const da = a.expectPayoffByChapter != null
      ? Math.abs((a.expectPayoffByChapter as number) - upcomingChapter)
      : 999;
    const db = b.expectPayoffByChapter != null
      ? Math.abs((b.expectPayoffByChapter as number) - upcomingChapter)
      : 999;
    if (da !== db) return da - db;
    const ai = a.introducedAtChapter ?? 0;
    const bi = b.introducedAtChapter ?? 0;
    return bi - ai;
  });

  return active.slice(0, maxCount);
}

// Helpers exported to be used by context layer without a second DB round-trip.
export function describeThreadsForPrompt(threads: NarrativeThread[], upcoming: number): string {
  return threads.map(t => {
    const due = t.expectPayoffByChapter != null
      ? (upcoming >= (t.expectPayoffByChapter as number)
        ? ' ⏰本章附近应回收'
        : `（预期第 ${t.expectPayoffByChapter} 章回收）`)
      : '';
    const intro = t.introducedAtChapter != null ? `第${t.introducedAtChapter}章埋下` : '';
    const detail = (t.detail ?? '').replace(/\s+/g, ' ').slice(0, 140);
    return `- [${t.kind}] ${t.label}｜${intro}${due}${detail ? `：${detail}` : ''}`;
  }).join('\n');
}

export function relevantCharacterStates(novel: Novel, plan: ChapterPlan, maxCount = 8) {
  const all = CharStates.listByNovel(novel.id);
  if (!all.length) return [];
  const haystack = [plan.title, plan.summary, plan.goal].filter(Boolean).join('\n');
  const scored = all.map(c => {
    let score = 0;
    if (haystack.includes(c.name)) score += 5;
    for (const rel of c.relations ?? []) {
      if (rel.target && haystack.includes(rel.target)) score += 1;
    }
    if (c.lastUpdatedAtChapter != null) {
      score += Math.max(0, 3 - Math.max(0, plan.chapterNumber - (c.lastUpdatedAtChapter as number)));
    }
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, maxCount).map(s => s.c);
}
