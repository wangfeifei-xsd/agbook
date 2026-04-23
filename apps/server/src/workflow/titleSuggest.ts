import { chatCompletion } from '../providers/openai.js';
import { ChapterPlans, Drafts, Novels, Providers } from '../repo.js';
import type { ModelProvider } from '../types.js';

/**
 * AI 起标题：基于本章已生成的正文（必要时节选首尾）加上规划摘要 / 目标，
 * 让模型产出一个精炼的章节标题。不写回数据库，调用方拿到后自行决定是否使用。
 */

function resolveProvider(providerId?: string | null): ModelProvider {
  if (providerId) {
    const p = Providers.get(providerId);
    if (p) return p;
  }
  const summarizer = Providers.getSummarizer();
  if (summarizer) return summarizer;
  const def = Providers.getDefault();
  if (def) return def;
  throw new Error('尚未配置任何模型 Provider，请先到「模型配置」页新建一个。');
}

function clampText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/**
 * Extract a single clean title out of whatever the model returned:
 * drop reasoning blocks, markdown fences, take first non-empty line,
 * strip quotes/brackets/prefixes/trailing punctuation, and hard-cap length.
 */
function stripTitle(raw: string): string {
  let s = raw;
  s = s.replace(/<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/^\s*<(think|thinking|reasoning|reflection)>[\s\S]*?(?:\n\s*\n|$)/i, '');
  s = s.trim();
  s = s.replace(/^```[a-zA-Z]*\n?/i, '').replace(/```$/i, '').trim();

  const firstLine = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] ?? '';
  s = firstLine;

  const pairs: [string, string][] = [
    ['"', '"'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['【', '】'],
    ['〈', '〉'],
    ['《', '》'],
  ];
  // Iteratively peel matching quote/bracket pairs until no more.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [l, r] of pairs) {
      if (s.startsWith(l) && s.endsWith(r) && s.length > l.length + r.length) {
        s = s.slice(l.length, s.length - r.length).trim();
        changed = true;
        break;
      }
    }
  }

  // Remove "第X章：" / "第X章·" style prefix the model sometimes adds.
  s = s.replace(/^第[\d零一二三四五六七八九十百千两]+章[：:·\-—\s.]*/, '').trim();
  // Remove meta prefixes like "标题：" / "章节标题：".
  s = s.replace(/^(标题|章节标题|题目|章题)[：:]\s*/, '').trim();
  // Trim trailing punctuation (Chinese + English).
  s = s.replace(/[。！？.!?,，、；;:：]+$/, '').trim();

  if (s.length > 30) s = s.slice(0, 30);
  return s;
}

export interface SuggestTitleInput {
  planId: string;
  providerId?: string | null;
}

export interface SuggestTitleResult {
  title: string;
  providerId: string;
  providerName: string;
  model: string;
  /** Which version of the draft we based the suggestion on, if any. */
  basedOnVersionId: string | null;
  /** Length of the content slice actually sent to the model. */
  contentChars: number;
}

export async function suggestChapterTitle(
  input: SuggestTitleInput
): Promise<SuggestTitleResult> {
  const plan = ChapterPlans.get(input.planId);
  if (!plan) throw new Error('章节计划不存在');
  const novel = Novels.get(plan.novelId);
  if (!novel) throw new Error('小说不存在');

  const draft = Drafts.getByPlan(plan.id);
  const versionId = draft?.currentVersionId ?? null;
  const version = versionId ? Drafts.getVersion(versionId) : null;
  const content = version?.content?.trim() ?? '';
  if (!content) {
    throw new Error('该章节尚未生成正文，无法基于内容起标题');
  }

  const provider = resolveProvider(input.providerId);

  // Preserve the opening (setup) and the ending (climax / reveal) which
  // carry the most signal for a title; drop the middle if the chapter is
  // very long. Thresholds chosen so typical 3000-word chapters send the
  // entire thing unchanged.
  const headCap = 4000;
  const tailCap = 1500;
  let truncated = content;
  if (content.length > headCap + tailCap + 50) {
    truncated =
      content.slice(0, headCap) +
      '\n\n…（中间省略）…\n\n' +
      content.slice(-tailCap);
  }

  const system = `你是一名资深中文小说编辑。读者会给你一整章（可能节选了首尾）的正文和章节规划信息，请为这一章拟一个精炼、有吸引力的章节标题。
要求：
1. 只输出标题本身，一行内，不加任何解释、引号、标点、前言。
2. 3-12 个汉字；不使用标点、引号、书名号、【】、序号、"第X章"等前缀。
3. 反映本章的核心事件 / 转折 / 氛围；不要剧透结局；避免"新征程""危机四伏""风云再起"之类陈词滥调。
4. 与小说题材和风格保持一致，优先使用正文中已出现的关键意象或人物。`;

  const userParts: string[] = [
    `【小说】《${novel.title}》${novel.genre ? `（${novel.genre}）` : ''}`,
    `【章节编号】第 ${plan.chapterNumber} 章`,
  ];
  if (plan.summary?.trim()) {
    userParts.push(`【章节摘要】\n${clampText(plan.summary.trim(), 400)}`);
  }
  if (plan.goal?.trim()) {
    userParts.push(`【本章目标】\n${clampText(plan.goal.trim(), 300)}`);
  }
  userParts.push(`【章节正文】\n${truncated}`);
  userParts.push('请直接输出一个章节标题，不要包含任何其他内容。');

  const reply = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    temperature: 0.7,
  });

  const title = stripTitle(reply);
  if (!title) throw new Error('模型返回为空，请稍后重试');

  return {
    title,
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    basedOnVersionId: versionId,
    contentChars: truncated.length,
  };
}
