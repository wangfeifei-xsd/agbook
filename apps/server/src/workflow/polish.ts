import { chatCompletion } from '../providers/openai.js';
import { Providers } from '../repo.js';
import type { ModelProvider } from '../types.js';

/**
 * Kinds of free-form text the user can ask the model to clean up.
 * Each purpose ships with a dedicated system prompt that constrains tone,
 * length and output shape so the response drops straight back into its
 * corresponding form field with no further editing required.
 */
export type PolishPurpose =
  | 'summary'
  | 'styleGuide'
  | 'forbiddenRules'
  | 'settingSummary'
  | 'settingContent'
  | 'outlineSummary'
  | 'outlineGoal'
  | 'chapterMustInclude'
  | 'chapterMustAvoid'
  | 'chapterContinuity'
  | 'chapterExtraInstructions';

interface PurposeSpec {
  label: string;
  system: string;
  /** Soft upper bound we mention to the model in Chinese characters. */
  maxChars: number;
}

const SPECS: Record<PolishPurpose, PurposeSpec> = {
  summary: {
    label: '小说简介',
    maxChars: 300,
    system:
      `你是一名资深中文小说编辑。用户会给你一段小说「简介」草稿，请把它润色成更清晰、有吸引力的正式简介。
要求：
1. 保留原意与核心设定、主角、主要冲突，不凭空编造新信息。
2. 80-300 字中文，语言流畅凝练，避免口语、啰嗦、重复。
3. 结尾自然收束，可以留一点悬念，但不要堆砌感叹号。
4. 仅输出润色后的正文，不要加"简介："、Markdown、解释说明或引号。`,
  },
  styleGuide: {
    label: '整体文风 / 风格要求',
    maxChars: 500,
    system:
      `你是一名专业的小说写作编辑。用户会给你一段「整体文风 / 风格要求」草稿，请整理为清晰、可操作的文风指引，方便后续喂给 AI 模型做章节生成。
要求：
1. 保留原文的所有关键要求（如叙事视角、语气、节奏、描写偏好等），不丢失任何约束。
2. 结构化但不啰嗦：用短句或条目列出；每条一个明确要求；避免空泛形容词。
3. 500 字以内；语言精确、可执行。
4. 仅输出润色后的正文。不要加标题、不要用 Markdown 代码块、不要写"以下是……"之类的前言或解释。`,
  },
  forbiddenRules: {
    label: '全局禁区 / 红线规则',
    maxChars: 500,
    system:
      `你是一名严谨的内容编辑。用户会给你一段「全局禁区 / 红线规则」草稿，请整理为一份清晰、无歧义的红线清单，后续会作为强约束喂给 AI 模型。
要求：
1. 保留原文所有禁区意图，不要弱化也不要新增不存在的规则。
2. 条目化输出：每条一个禁区，语气明确（建议以"禁止…""不得…""避免…"开头）。
3. 每条要短而具体，避免含糊的"合理""适度"之类表述；能量化的就量化。
4. 500 字以内；最多 15 条。
5. 仅输出润色后的正文。不要加标题、不要用 Markdown 代码块、不要写任何前言或解释。`,
  },
  settingSummary: {
    label: '设定条目 · 摘要',
    maxChars: 120,
    system:
      `你是一名小说设定编辑。用户会给你一条「设定条目」的摘要草稿（可能是人物、势力、世界观、地点、道具、规则、文风等），请润色为凝练、可直接作为上下文注入给写作模型的一句话摘要。
要求：
1. 忠于原文，不要新增、弱化或扭曲设定，不要编造未出现的信息。
2. 80-120 字以内；信息密度高，去掉口语、感叹、套话。
3. 突出最关键的身份/定义/核心约束；便于让下游模型只看摘要就能正确使用这个条目。
4. 单段纯文本，不要分行、不要标题、不要列表符号、不要 Markdown、不要引号。
5. 仅输出润色后的正文。`,
  },
  settingContent: {
    label: '设定条目 · 详细内容',
    maxChars: 800,
    system:
      `你是一名小说设定编辑。用户会给你一条「设定条目」的详细内容草稿，请整理为结构清晰、便于查阅和被写作模型引用的设定文档。
要求：
1. 忠于原文，不要新增、弱化或扭曲设定；拿不准的信息保留原文措辞。
2. 结构化输出：按合适的小节组织（如「身份/定位」「背景」「性格/能力」「关键关系」「使用约束」等），小节名用【】包裹，后跟内容；没内容的小节不要写。
3. 800 字以内；语言凝练准确，避免空泛形容词和口水话。
4. 纯文本输出，不使用 Markdown 代码块、不使用 # 标题、不加任何前言或解释。
5. 仅输出润色后的正文。`,
  },
  outlineSummary: {
    label: '大纲节点 · 摘要',
    maxChars: 400,
    system:
      `你是一名资深小说编辑。用户会给你一条「大纲节点」的摘要草稿（可能对应总纲、卷纲、章纲或场景），请整理为剧情推进清晰、信息密度高的摘要。
要求：
1. 忠于原文的剧情要点，不要编造事件、人物或设定；原文缺失的信息不要补。
2. 聚焦"这一段讲了什么"——按时间或因果顺序叙述：起点情境 → 关键事件 / 转折 → 结尾状态。
3. 150-400 字，单段或少量短段落；语言凝练，避免口水话和空泛情绪形容。
4. 第三人称叙事视角，使用与原文一致的人物/地点/势力名称；不要使用"第一章""本场景"之类元叙述。
5. 纯文本输出，不使用 Markdown、标题或列表符号；不加任何前言或解释。
6. 仅输出润色后的正文。`,
  },
  outlineGoal: {
    label: '大纲节点 · 目标 / 预期',
    maxChars: 200,
    system:
      `你是一名专业的小说结构编辑。用户会给你一条「大纲节点」的目标/预期草稿，请整理为清晰、可执行的写作目标，方便后续喂给 AI 生成章节。
要求：
1. 忠于原文意图：这一节要达到的戏剧效果、信息披露、人物弧光、伏笔或情绪体验。
2. 目标导向而非剧情复述——不要重写"发生了什么"，而是写"读者应该收获什么 / 后续需要铺垫什么"。
3. 80-200 字；可使用 2-5 条短条目（以「- 」开头），也可以是一段短文，取更合适者。
4. 每条短而具体，避免"精彩""吸引人"之类空泛用词；能量化就量化（如"在本节之前不得暴露…的身份"）。
5. 纯文本输出，不使用 Markdown 代码块 / # 标题 / 任何前言或解释。
6. 仅输出润色后的正文。`,
  },
  chapterMustInclude: {
    label: '章节规则 · 必须出现的情节点',
    maxChars: 500,
    system:
      `你是一名严谨的小说结构编辑。用户会给你一段「必须出现的情节点」草稿（后续会按换行切分成一条一条喂给写作模型），请整理为可执行、信息密度高的"必须发生"清单。
要求：
1. 忠于原文意图，不要新增原文没有的情节点，不要弱化任何一条；有歧义的地方保留原文措辞。
2. 每条占一行，行与行之间用换行分隔；【严禁】在每行开头加「- 」「• 」「1.」「①」等列表符号。
3. 每条以"必须…""需要…""主角要…""要展示…"等目标动词开头，描述一个具体的剧情事件或揭示点。
4. 每条短而具体（建议 15-40 字），避免空泛情绪形容词；能指明时机/对象的就写清楚（如"在章末揭示…"）。
5. 500 字以内；最多 12 条；重复或可合并的条目合并。
6. 纯文本输出，不使用 Markdown、不使用引号、不加任何前言或解释。
7. 仅输出润色后的正文。`,
  },
  chapterMustAvoid: {
    label: '章节规则 · 禁止出现的内容',
    maxChars: 500,
    system:
      `你是一名严谨的小说内容编辑。用户会给你一段「禁止出现的内容」草稿（后续会按换行切分成一条一条喂给写作模型），请整理为无歧义的"禁止清单"。
要求：
1. 忠于原文意图，不要弱化也不要新增不存在的禁令；拿不准的保留原文措辞。
2. 每条占一行，行与行之间用换行分隔；【严禁】在每行开头加「- 」「• 」「1.」「①」等列表符号。
3. 每条以"禁止…""不得…""避免…"等动词开头，指向一个具体的人、事、描写或表达。
4. 每条短而具体（建议 10-30 字），避免"合理""适度"等含糊用词；能量化就量化。
5. 500 字以内；最多 12 条；重复或可合并的条目合并。
6. 纯文本输出，不使用 Markdown、不使用引号、不加任何前言或解释。
7. 仅输出润色后的正文。`,
  },
  chapterContinuity: {
    label: '章节规则 · 连续性要求',
    maxChars: 300,
    system:
      `你是一名小说连续性编辑。用户会给你一段「连续性要求」草稿（承接上一章的信息、伏笔或状态），请整理为一段精确、便于写作模型核对的承接说明。
要求：
1. 忠于原文意图，不要新增原文缺失的前情；拿不准的保留原文措辞。
2. 聚焦"从上一章承接了什么"——人物当前位置/关系/状态、尚未揭示的伏笔、已发生不能推翻的事件。
3. 300 字以内；可以是一段短文，也可以用 2-4 条短条目（以「- 」开头），取更清晰者。
4. 使用与原文一致的人物 / 地点 / 势力名称；避免模糊代词。
5. 纯文本输出，不使用 Markdown 代码块 / # 标题，不加任何前言或解释。
6. 仅输出润色后的正文。`,
  },
  chapterExtraInstructions: {
    label: '章节规则 · 额外指令',
    maxChars: 400,
    system:
      `你是一名小说 Prompt 工程师。用户会给你一段「额外指令」草稿（会被原样附加到写作模型的 Prompt 末尾），请整理为清晰、可执行、对模型友好的指令片段。
要求：
1. 忠于原文意图，不要新增未要求的指令，不要弱化任何约束。
2. 指令化语气：使用祈使句或明确的"必须/不要/优先/尽量"等指令词，面向"写作模型"本身。
3. 去口水话、去情绪化、去重复；能合并就合并。
4. 400 字以内；可以是若干短条目（以「- 」开头）或几段短文，按更清晰的形式组织。
5. 纯文本输出，不使用 Markdown 代码块 / # 标题，不要写"以下是…"等前言。
6. 仅输出润色后的正文。`,
  },
};

function stripWrapping(raw: string): string {
  let s = raw;
  // Strip reasoning-model thinking blocks. Some OpenAI-compatible providers
  // (MiniMax M2.5, DeepSeek R1, etc.) emit the chain-of-thought inline as
  // <think>...</think> / <thinking>...</thinking> / <reasoning>...</reasoning>
  // before the actual answer. Drop all such blocks; if the closing tag is
  // missing (truncated), drop everything up to the next blank line.
  s = s.replace(/<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/^\s*<(think|thinking|reasoning|reflection)>[\s\S]*?(?:\n\s*\n|$)/i, '');
  s = s.trim();
  // Strip accidental markdown code fences (```text ... ``` or ``` ... ```).
  s = s.replace(/^```[a-zA-Z]*\n?/i, '').replace(/```$/i, '').trim();
  // Strip one layer of matching quotes the model sometimes wraps around
  // the whole reply ("..." / “...” / 「...」).
  const pairs: [string, string][] = [
    ['"', '"'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [l, r] of pairs) {
    if (s.startsWith(l) && s.endsWith(r) && s.length > l.length + r.length) {
      s = s.slice(l.length, s.length - r.length).trim();
      break;
    }
  }
  return s;
}

export interface PolishInput {
  text: string;
  purpose: PolishPurpose;
  providerId?: string | null;
  /**
   * Optional extra context that helps the model stay on-style
   * (e.g. the novel's genre, title) — not strictly required.
   */
  hint?: string;
}

export interface PolishResult {
  text: string;
  providerId: string;
  providerName: string;
  model: string;
}

/**
 * Pick a provider for polish tasks. Prefer the explicit `providerId`,
 * otherwise fall back to the configured summarizer (cheap model), and
 * finally to the generation default.
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

export async function polishText(input: PolishInput): Promise<PolishResult> {
  const trimmed = input.text?.trim();
  if (!trimmed) {
    throw new Error('文本为空，无需润色');
  }
  const spec = SPECS[input.purpose];
  if (!spec) throw new Error(`unsupported polish purpose: ${input.purpose}`);
  const provider = resolveProvider(input.providerId);

  const userParts: string[] = [];
  if (input.hint) userParts.push(`【背景参考】\n${input.hint.trim()}`);
  userParts.push(`【待润色：${spec.label}】\n${trimmed}`);
  userParts.push(`请输出润色后的正文（不超过约 ${spec.maxChars} 字）。`);

  const reply = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: spec.system },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    temperature: 0.5,
  });

  const polished = stripWrapping(reply);
  if (!polished) {
    throw new Error('模型返回为空，请稍后重试');
  }
  return {
    text: polished,
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
  };
}
