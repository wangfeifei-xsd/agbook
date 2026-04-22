import {
  ArcSummaries,
  ChapterPlans,
  ChapterSummaries,
  Drafts,
  Outlines,
  Settings,
  Threads,
  CharStates,
} from '../repo.js';
import type {
  ArcSummary,
  ChapterPlan,
  ChapterSummary,
  CharacterState,
  ContextOverrides,
  NarrativeThread,
  Novel,
  OutlineNode,
  SettingItem,
} from '../types.js';
import {
  describeThreadsForPrompt,
  pickRelevantThreads,
  relevantCharacterStates,
} from './summarize.js';

export interface RecentChapterInject {
  plan: ChapterPlan;
  summary?: ChapterSummary;
  tail?: string;
}

export interface ChapterContext {
  novel: Novel;
  plan: ChapterPlan;
  relatedSettings: SettingItem[];           // may be empty when section is off
  outlineChain: OutlineNode[];
  recent: RecentChapterInject[];            // 最近章节：摘要 + (可选) 尾段
  earlierBriefs: { plan: ChapterPlan; brief: string }[]; // 更早章节只注入 brief
  arcSummaries: ArcSummary[];               // 覆盖更早章节的卷/弧摘要
  activeThreads: NarrativeThread[];         // 活跃伏笔/悬念
  characterStates: CharacterState[];        // 本章相关角色状态
  /** Indicates whether a section is disabled entirely in this build. */
  disabled: {
    settings?: boolean;
    arcSummaries?: boolean;
    chapterSummaries?: boolean;
    threads?: boolean;
    characters?: boolean;
  };
}

const RECENT_WITH_TAIL_COUNT = 1;     // 最近 1 章保留原文尾段
const RECENT_SUMMARY_ONLY_COUNT = 4;  // 再往前 4 章只注入结构化摘要
const EARLIER_BRIEF_LIMIT = 12;       // 更早章节只注入 brief，最多 12 条
const TAIL_CHARS = 800;
const MAX_ACTIVE_THREADS = 12;
const MAX_CHARACTER_STATES = 8;

function truncate(text: string, max = 800): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '……';
}

function scoreRelevance(item: SettingItem, plan: ChapterPlan): number {
  const haystacks = [plan.title, plan.summary, plan.goal].filter(Boolean).join('\n');
  if (!haystacks) return 0;
  let score = 0;
  const name = item.name || '';
  if (name && haystacks.includes(name)) score += 5;
  const summary = item.summary || '';
  if (summary) {
    for (const ch of summary.slice(0, 50)) {
      if (haystacks.includes(ch)) score += 0.05;
    }
  }
  if (item.tags) {
    for (const tag of item.tags) {
      if (tag && haystacks.includes(tag)) score += 3;
    }
  }
  if (item.type === 'worldview' || item.type === 'style') score += 1;
  return score;
}

function buildRelatedSettings(novel: Novel, plan: ChapterPlan): SettingItem[] {
  const allSettings = Settings.listByNovel(novel.id);
  const scored = allSettings
    .map(s => ({ item: s, score: scoreRelevance(s, plan) }))
    .sort((a, b) => b.score - a.score);

  const topByScore = scored.filter(s => s.score > 0).slice(0, 10).map(s => s.item);
  const characters = allSettings.filter(s => s.type === 'character').slice(0, 6);
  const worldview = allSettings.filter(s => s.type === 'worldview').slice(0, 3);
  const rules = allSettings.filter(s => s.type === 'rule').slice(0, 3);

  const merged = new Map<string, SettingItem>();
  for (const list of [topByScore, characters, worldview, rules]) {
    for (const item of list) merged.set(item.id, item);
  }
  return Array.from(merged.values()).slice(0, 12);
}

/**
 * Build the chapter context used to prompt the LLM.
 * Respects optional per-chapter overrides: each block can be forced to auto,
 * manual (with supplied IDs) or off. novelInfo/outline are always on.
 */
export function buildChapterContext(
  novel: Novel,
  plan: ChapterPlan,
  overrides?: ContextOverrides | null
): ChapterContext {
  const disabled: ChapterContext['disabled'] = {};

  // ---------- settings ----------
  let relatedSettings: SettingItem[] = [];
  if (overrides?.settings?.mode === 'off') {
    disabled.settings = true;
  } else {
    relatedSettings = buildRelatedSettings(novel, plan);
  }

  // ---------- outline (always auto) ----------
  const outlineChain: OutlineNode[] = [];
  if (plan.outlineNodeId) {
    const allOutline = Outlines.listByNovel(novel.id);
    const byId = new Map(allOutline.map(n => [n.id, n]));
    let current = byId.get(plan.outlineNodeId) ?? null;
    while (current) {
      outlineChain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) ?? null : null;
    }
  }

  // ---------- arc summaries ----------
  let arcSummaries: ArcSummary[] = [];
  const coveredByArc = new Set<string>();
  if (overrides?.arcSummaries?.mode === 'off') {
    disabled.arcSummaries = true;
  } else {
    const all = ArcSummaries.listByNovel(novel.id);
    if (overrides?.arcSummaries?.mode === 'manual') {
      const wanted = new Set(overrides.arcSummaries.arcIds ?? []);
      arcSummaries = all.filter(a => wanted.has(a.id));
    } else {
      for (const arc of all) {
        const inRange = (arc.fromChapter ?? 0) < plan.chapterNumber;
        if (inRange) arcSummaries.push(arc);
      }
    }
    for (const arc of arcSummaries) {
      for (const id of arc.chapterPlanIds ?? []) coveredByArc.add(id);
    }
  }

  // ---------- chapter summaries (unified: recent + earlier briefs) ----------
  const recent: RecentChapterInject[] = [];
  const earlierBriefs: { plan: ChapterPlan; brief: string }[] = [];
  const chapterSumOpt = overrides?.chapterSummaries;

  if (chapterSumOpt?.mode === 'off') {
    disabled.chapterSummaries = true;
  } else {
    const priorPlans = ChapterPlans.listByNovel(novel.id)
      .filter(p => p.chapterNumber < plan.chapterNumber)
      .sort((a, b) => b.chapterNumber - a.chapterNumber);

    if (chapterSumOpt?.mode === 'manual') {
      // Manual: exactly the plans the user picked. Latest one(s) keep the tail
      // unless includeTail is explicitly disabled.
      const wantedIds = new Set(chapterSumOpt.planIds ?? []);
      const picked = priorPlans.filter(p => wantedIds.has(p.id));
      picked.sort((a, b) => b.chapterNumber - a.chapterNumber);
      const includeTail = chapterSumOpt.includeTail !== false;
      const tailCount = includeTail ? RECENT_WITH_TAIL_COUNT : 0;

      picked.forEach((p, idx) => {
        const cs = ChapterSummaries.getByPlan(p.id) ?? undefined;
        let tail: string | undefined;
        if (idx < tailCount) {
          const draft = Drafts.getByPlan(p.id);
          if (draft?.currentVersionId) {
            const ver = Drafts.getVersion(draft.currentVersionId);
            if (ver?.content) tail = truncate(ver.content.slice(-TAIL_CHARS), TAIL_CHARS);
          }
        }
        // Recent = top RECENT_WITH_TAIL_COUNT + next RECENT_SUMMARY_ONLY_COUNT; fallthrough to earlier briefs.
        if (idx < RECENT_WITH_TAIL_COUNT + RECENT_SUMMARY_ONLY_COUNT) {
          recent.push({ plan: p, summary: cs, tail });
        } else if (cs) {
          earlierBriefs.push({ plan: p, brief: cs.brief });
        }
      });
    } else {
      // Auto
      const includeTail = chapterSumOpt?.includeTail !== false;
      const tailCount = includeTail ? RECENT_WITH_TAIL_COUNT : 0;
      const recentWithTail = priorPlans.slice(0, tailCount);
      const recentSummaryOnly = priorPlans.slice(
        tailCount,
        tailCount + (RECENT_WITH_TAIL_COUNT + RECENT_SUMMARY_ONLY_COUNT - tailCount)
      );
      const earlier = priorPlans.slice(RECENT_WITH_TAIL_COUNT + RECENT_SUMMARY_ONLY_COUNT);

      for (const p of recentWithTail) {
        const cs = ChapterSummaries.getByPlan(p.id) ?? undefined;
        let tail: string | undefined;
        const draft = Drafts.getByPlan(p.id);
        if (draft?.currentVersionId) {
          const ver = Drafts.getVersion(draft.currentVersionId);
          if (ver?.content) tail = truncate(ver.content.slice(-TAIL_CHARS), TAIL_CHARS);
        }
        recent.push({ plan: p, summary: cs, tail });
      }
      for (const p of recentSummaryOnly) {
        const cs = ChapterSummaries.getByPlan(p.id) ?? undefined;
        recent.push({ plan: p, summary: cs });
      }
      for (const p of earlier) {
        if (coveredByArc.has(p.id)) continue;
        const cs = ChapterSummaries.getByPlan(p.id);
        if (!cs) continue;
        earlierBriefs.push({ plan: p, brief: cs.brief });
        if (earlierBriefs.length >= EARLIER_BRIEF_LIMIT) break;
      }
    }
  }

  // ---------- threads ----------
  let activeThreads: NarrativeThread[] = [];
  const threadOpt = overrides?.threads;
  if (threadOpt?.mode === 'off') {
    disabled.threads = true;
  } else if (threadOpt?.mode === 'manual') {
    const wanted = new Set(threadOpt.threadIds ?? []);
    const all = Threads.listByNovel(novel.id);
    activeThreads = all.filter(t => wanted.has(t.id));
  } else {
    activeThreads = pickRelevantThreads(novel.id, plan.chapterNumber, MAX_ACTIVE_THREADS);
  }

  // ---------- characters ----------
  let characterStates: CharacterState[] = [];
  const charOpt = overrides?.characters;
  if (charOpt?.mode === 'off') {
    disabled.characters = true;
  } else if (charOpt?.mode === 'manual') {
    const wanted = new Set(charOpt.stateIds ?? []);
    const all = CharStates.listByNovel(novel.id);
    characterStates = all.filter(c => wanted.has(c.id));
  } else {
    characterStates = relevantCharacterStates(novel, plan, MAX_CHARACTER_STATES);
  }

  return {
    novel,
    plan,
    relatedSettings,
    outlineChain,
    recent,
    earlierBriefs,
    arcSummaries,
    activeThreads,
    characterStates,
    disabled,
  };
}

export function renderContextForPrompt(ctx: ChapterContext): string {
  const lines: string[] = [];
  lines.push(`【小说基本信息】`);
  lines.push(`- 书名：${ctx.novel.title}`);
  if (ctx.novel.genre) lines.push(`- 类型：${ctx.novel.genre}`);
  if (ctx.novel.summary) lines.push(`- 简介：${truncate(ctx.novel.summary, 400)}`);
  if (ctx.novel.styleGuide) lines.push(`- 整体文风：${truncate(ctx.novel.styleGuide, 300)}`);
  if (ctx.novel.forbiddenRules) lines.push(`- 全局禁区：${truncate(ctx.novel.forbiddenRules, 300)}`);

  if (ctx.outlineChain.length) {
    lines.push('\n【大纲脉络】');
    for (const node of ctx.outlineChain) {
      lines.push(`- [${node.level}] ${node.title}${node.summary ? `：${truncate(node.summary, 200)}` : ''}`);
    }
  }

  if (ctx.relatedSettings.length) {
    lines.push('\n【相关设定】');
    for (const s of ctx.relatedSettings) {
      const head = `- [${s.type}] ${s.name}`;
      const body = s.summary || s.content || '';
      lines.push(body ? `${head}：${truncate(body, 220)}` : head);
    }
  }

  if (ctx.arcSummaries.length) {
    lines.push('\n【卷/弧 长程摘要】');
    for (const arc of ctx.arcSummaries) {
      const range = arc.fromChapter && arc.toChapter
        ? `第${arc.fromChapter}-${arc.toChapter}章`
        : '';
      lines.push(`- 《${arc.title}》${range ? ` (${range})` : ''}：${truncate(arc.brief, 500)}`);
      if (arc.keyThreads?.length) {
        for (const k of arc.keyThreads.slice(0, 8)) {
          lines.push(`  · ${truncate(k, 160)}`);
        }
      }
    }
  }

  if (ctx.earlierBriefs.length) {
    lines.push('\n【更早章节 brief（按章号升序）】');
    const sorted = [...ctx.earlierBriefs].sort((a, b) => a.plan.chapterNumber - b.plan.chapterNumber);
    for (const e of sorted) {
      lines.push(`- 第${e.plan.chapterNumber}章${e.plan.title ? ` ${e.plan.title}` : ''}：${truncate(e.brief, 220)}`);
    }
  }

  if (ctx.recent.length) {
    lines.push('\n【最近章节摘要】');
    const asc = [...ctx.recent].sort((a, b) => a.plan.chapterNumber - b.plan.chapterNumber);
    for (const r of asc) {
      const head = `▼ 第${r.plan.chapterNumber}章${r.plan.title ? ` ${r.plan.title}` : ''}`;
      if (r.summary) {
        lines.push(`${head}`);
        lines.push(`  brief: ${truncate(r.summary.brief, 300)}`);
        if (r.summary.keyEvents?.length) {
          lines.push('  key_events:');
          for (const ev of r.summary.keyEvents.slice(0, 6)) {
            const who = ev.who ? `${ev.who}：` : '';
            lines.push(`    - ${who}${truncate(ev.what, 160)}`);
          }
        }
        if (r.summary.openQuestions?.length) {
          lines.push('  open_questions:');
          for (const q of r.summary.openQuestions.slice(0, 4)) {
            lines.push(`    - ${truncate(q, 120)}`);
          }
        }
      } else {
        lines.push(`${head}（尚无摘要）`);
      }
      if (r.tail) {
        lines.push('  tail（原文结尾，用于承接行文）:');
        lines.push(r.tail.split('\n').map(l => `  ${l}`).join('\n'));
      }
    }
  }

  if (ctx.activeThreads.length) {
    lines.push('\n【活跃伏笔 / 悬念（请保持连续性，必要时在本章回收或推进）】');
    lines.push(describeThreadsForPrompt(ctx.activeThreads, ctx.plan.chapterNumber));
  }

  if (ctx.characterStates.length) {
    lines.push('\n【相关角色当前状态】');
    for (const c of ctx.characterStates) {
      const parts: string[] = [];
      if (c.location) parts.push(`位置:${c.location}`);
      if (c.condition) parts.push(`状态:${c.condition}`);
      if (c.notableFlags?.length) parts.push(`标签:${c.notableFlags.slice(0, 5).join('、')}`);
      if (c.possessions?.length) parts.push(`持有:${c.possessions.slice(0, 5).join('、')}`);
      if (c.relations?.length) {
        parts.push(`关系:${c.relations.slice(0, 4).map(r => `${r.target}(${r.relation})`).join('、')}`);
      }
      if (c.lastUpdatedAtChapter != null) parts.push(`上次更新:第${c.lastUpdatedAtChapter}章`);
      lines.push(`- ${c.name}｜${parts.join('；') || '（无详细状态）'}`);
    }
  }

  lines.push('\n【本章信息】');
  lines.push(`- 章节编号：第 ${ctx.plan.chapterNumber} 章`);
  if (ctx.plan.title) lines.push(`- 标题：${ctx.plan.title}`);
  if (ctx.plan.summary) lines.push(`- 章节摘要：${ctx.plan.summary}`);
  if (ctx.plan.goal) lines.push(`- 章节目标：${ctx.plan.goal}`);

  return lines.join('\n');
}
