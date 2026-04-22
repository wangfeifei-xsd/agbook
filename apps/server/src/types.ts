export interface Novel {
  id: string;
  title: string;
  genre?: string | null;
  summary?: string | null;
  targetWordCount?: number | null;
  styleGuide?: string | null;
  forbiddenRules?: string | null;
  status?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type SettingType =
  | 'worldview'
  | 'character'
  | 'faction'
  | 'location'
  | 'item'
  | 'rule'
  | 'style'
  | 'other';

export interface SettingItem {
  id: string;
  novelId: string;
  type: SettingType;
  name: string;
  summary?: string | null;
  content?: string | null;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export type OutlineLevel = 'novel' | 'volume' | 'chapter' | 'scene';

export interface OutlineNode {
  id: string;
  novelId: string;
  parentId?: string | null;
  level: OutlineLevel;
  title: string;
  summary?: string | null;
  goal?: string | null;
  orderIndex: number;
  status?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterRuleSet {
  narrativePerspective?: string;
  toneStyle?: string;
  dialogueRatioPreference?: 'low' | 'medium' | 'high';
  descriptionRatioPreference?: 'low' | 'medium' | 'high';
  mustIncludePoints?: string[];
  mustAvoidPoints?: string[];
  continuityRequirements?: string;
  mustGenerateOutlineFirst?: boolean;
  mustGenerateByScenes?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  extraInstructions?: string;
}

export type ContextSectionMode = 'auto' | 'manual' | 'off';

/**
 * Per-chapter overrides for the context assembled by workflow/context.ts.
 * Each block can be auto (use default heuristic), manual (use the supplied IDs
 * only), or off (skip entirely). novelInfo / outline are always on.
 */
export interface ContextOverrides {
  settings?: { mode: 'auto' | 'off' };
  arcSummaries?: {
    mode: ContextSectionMode;
    arcIds?: string[];
  };
  chapterSummaries?: {
    mode: ContextSectionMode;
    planIds?: string[];
    /** Whether to include the trailing raw text of the latest chapter; default true for auto. */
    includeTail?: boolean;
  };
  threads?: {
    mode: ContextSectionMode;
    threadIds?: string[];
    /** When auto, whether to also include resolved threads explicitly pinned by threadIds. Optional. */
  };
  characters?: {
    mode: ContextSectionMode;
    stateIds?: string[];
  };
}

export interface ChapterPlan {
  id: string;
  novelId: string;
  outlineNodeId?: string | null;
  chapterNumber: number;
  title?: string | null;
  summary?: string | null;
  goal?: string | null;
  targetWordCount?: number | null;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  status: 'planned' | 'generating' | 'drafted' | 'reviewing' | 'finalized';
  ruleSet: ChapterRuleSet;
  contextOverrides?: ContextOverrides | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterDraft {
  id: string;
  novelId: string;
  chapterPlanId: string;
  currentVersionId?: string | null;
  status: 'empty' | 'drafted' | 'reviewed' | 'revised' | 'finalized';
  lastGeneratedAt?: number | null;
  updatedAt: number;
}

export type DraftSourceType = 'generated' | 'review_revised' | 'manual_edit';

export interface DraftVersion {
  id: string;
  draftId: string;
  versionNumber: number;
  content: string;
  sourceType: DraftSourceType;
  generationContext?: string | null;
  createdAt: number;
}

export type ReviewSeverity = 'info' | 'minor' | 'major' | 'critical';

export interface ReviewIssue {
  type: string;
  severity: ReviewSeverity;
  message: string;
  suggestion?: string;
  ruleSource?: string;
  relatedExcerpt?: string;
}

export interface ReviewReport {
  id: string;
  novelId: string;
  chapterPlanId: string;
  draftVersionId: string;
  result: 'pass' | 'warn' | 'fail';
  score?: number;
  summary?: string;
  issues: ReviewIssue[];
  createdAt: number;
}

export type ProviderPurpose = 'generation' | 'summarizer';

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  headers?: Record<string, string>;
  isDefault: boolean;
  isSummarizerDefault: boolean;
  purpose: ProviderPurpose;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterSummaryEvent {
  who?: string;
  what: string;
  where?: string;
  when?: string;
}

export interface ChapterSummaryStateChange {
  target: string;
  change: string;
}

export interface ChapterSummary {
  id: string;
  novelId: string;
  chapterPlanId: string;
  draftVersionId: string;
  brief: string;
  keyEvents: ChapterSummaryEvent[];
  stateChanges: ChapterSummaryStateChange[];
  openQuestions: string[];
  raw?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArcSummary {
  id: string;
  novelId: string;
  title: string;
  fromChapter?: number | null;
  toChapter?: number | null;
  chapterPlanIds: string[];
  brief: string;
  keyThreads: string[];
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ThreadKind = 'foreshadow' | 'subplot' | 'promise' | 'mystery';
export type ThreadStatus = 'active' | 'resolved' | 'abandoned';
export type ThreadSource = 'auto' | 'manual';
export type ThreadConfidence = 'low' | 'medium' | 'high';

export interface NarrativeThread {
  id: string;
  novelId: string;
  kind: ThreadKind;
  label: string;
  detail?: string | null;
  introducedAtChapter?: number | null;
  expectPayoffByChapter?: number | null;
  resolvedAtChapter?: number | null;
  status: ThreadStatus;
  source: ThreadSource;
  confidence: ThreadConfidence;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterRelation {
  target: string;
  relation: string;
}

export interface CharacterState {
  id: string;
  novelId: string;
  name: string;
  settingItemId?: string | null;
  location?: string | null;
  condition?: string | null;
  relations: CharacterRelation[];
  possessions: string[];
  notableFlags: string[];
  lastUpdatedAtChapter?: number | null;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}
