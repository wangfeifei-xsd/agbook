import { chatCompletion } from '../providers/openai.js';
import { ChapterPlans, Drafts, Novels, Providers, Reviews } from '../repo.js';
import type { ReviewIssue } from '../types.js';
import { buildChapterContext, renderContextForPrompt } from './context.js';
import { renderRulesForPrompt, resolveChapterRules, validateRules, countChineseWords } from './rules.js';
import { summarizeChapter } from './summarize.js';

export interface GenerateChapterResult {
  draftId: string;
  versionId: string;
  content: string;
  wordCount: number;
  review: {
    id: string;
    result: 'pass' | 'warn' | 'fail';
    issues: ReviewIssue[];
  };
  summary?: {
    ok: boolean;
    message?: string;
  };
}

export async function generateChapter(chapterPlanId: string, options?: {
  providerId?: string;
  temperature?: number;
}): Promise<GenerateChapterResult> {
  const plan = ChapterPlans.get(chapterPlanId);
  if (!plan) throw new Error('章节计划不存在');
  const novel = Novels.get(plan.novelId);
  if (!novel) throw new Error('小说不存在');

  const provider = options?.providerId
    ? Providers.get(options.providerId)
    : Providers.getDefault();
  if (!provider) throw new Error('未配置模型服务，请先在「模型配置」中添加一个 Provider。');

  const ctx = buildChapterContext(novel, plan, plan.contextOverrides);
  const rules = resolveChapterRules(novel, plan);

  const contextBlock = renderContextForPrompt(ctx);
  const rulesBlock = renderRulesForPrompt(rules, plan);

  const system = [
    '你是一位资深的中文小说作者和责编。',
    '你会严格遵守用户提供的小说设定、大纲脉络和章节规则，并产出连贯、细腻、具有画面感的正文。',
    '只输出章节正文，不要输出任何解释、前言、自我说明或 Markdown 标题。',
    '不要标注章节号或“第 X 章”等前缀，除非章节规则明确要求。',
  ].join('\n');

  const user = [
    contextBlock,
    '',
    rulesBlock,
    '',
    '【任务】',
    '请基于以上信息，生成本章完整正文。严格满足本章规则中的字数、必须情节点、禁区要求。',
    '正文要自然衔接上一章，保持人物设定与文风一致。',
  ].join('\n');

  ChapterPlans.update(plan.id, { status: 'generating' });

  let content = '';
  try {
    content = await chatCompletion({
      provider,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: options?.temperature ?? 0.85,
    });
  } catch (e) {
    ChapterPlans.update(plan.id, { status: 'planned' });
    throw e;
  }

  const cleaned = content.trim();
  const draft = Drafts.getOrCreate(novel.id, plan.id);
  const version = Drafts.addVersion({
    draftId: draft.id,
    content: cleaned,
    sourceType: 'generated',
    generationContext: JSON.stringify({
      providerId: provider.id,
      model: provider.model,
      rules,
    }),
  });
  Drafts.setCurrentVersion(draft.id, version.id, 'drafted');

  const issues = validateRules(cleaned, rules);
  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasMajor = issues.some(i => i.severity === 'major');
  const result: 'pass' | 'warn' | 'fail' = hasCritical ? 'fail' : (hasMajor ? 'warn' : 'pass');

  const report = Reviews.create({
    novelId: novel.id,
    chapterPlanId: plan.id,
    draftVersionId: version.id,
    result,
    summary: buildReviewSummary(issues, cleaned, rules),
    issues,
  });

  ChapterPlans.update(plan.id, { status: result === 'fail' ? 'reviewing' : 'drafted' });

  let summaryMeta: GenerateChapterResult['summary'];
  try {
    await summarizeChapter(plan.id, { versionId: version.id });
    summaryMeta = { ok: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    summaryMeta = { ok: false, message: msg };
    // Intentionally non-fatal: keep the draft, surface a note for the UI/log.
    try {
      (globalThis as any).console?.warn?.(
        `[summarize] chapter ${plan.id} failed: ${msg}`
      );
    } catch { /* ignore */ }
  }

  return {
    draftId: draft.id,
    versionId: version.id,
    content: cleaned,
    wordCount: countChineseWords(cleaned),
    review: {
      id: report.id,
      result,
      issues,
    },
    summary: summaryMeta,
  };
}

function buildReviewSummary(issues: ReviewIssue[], content: string, rules: any): string {
  const len = countChineseWords(content);
  const countsBySeverity = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] || 0) + 1;
    return acc;
  }, {});
  const parts: string[] = [];
  parts.push(`正文 ${len} 字`);
  if (rules.targetWordCount) parts.push(`目标 ${rules.targetWordCount}`);
  if (rules.minWordCount || rules.maxWordCount) {
    parts.push(`区间 ${rules.minWordCount || '不限'} - ${rules.maxWordCount || '不限'}`);
  }
  if (!issues.length) parts.push('未发现规则问题');
  else parts.push(`问题 ${issues.length} 项（${JSON.stringify(countsBySeverity)}）`);
  return parts.join('；');
}
