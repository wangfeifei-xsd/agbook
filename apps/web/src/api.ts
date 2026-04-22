import type {
  ArcSummary, ChapterPlan, ChapterRuleSet, ChapterSummary, CharacterState,
  ContextOverrides, DraftVersion, GenerateResult, ModelProvider,
  NarrativeThread, Novel, OutlineLevel, OutlineNode, ReviewReport,
  SettingItem, SettingType, ThreadStatus,
} from './types';

// When the frontend runs inside the packaged Tauri app the page is served
// from a custom tauri:// origin and relative `/api/...` URLs won't reach the
// Node sidecar. We detect that case and prefix an absolute address. During
// browser/dev mode we keep the relative path so Vite's proxy keeps working.
function resolveApiBase(): string {
  if (typeof window === 'undefined') return '';
  const injected = (window as any).__AGBOOK_API_BASE__;
  if (typeof injected === 'string' && injected.length > 0) return injected;
  const { protocol, hostname } = window.location;
  // Tauri v2 serves the webview from `tauri://localhost` on macOS/Linux and
  // from `http://tauri.localhost` on Windows; in either case the origin does
  // not match the Node sidecar's 127.0.0.1:8787 and we need an absolute URL.
  if (protocol.startsWith('tauri') || hostname === 'tauri.localhost') {
    return 'http://127.0.0.1:8787';
  }
  return '';
}

const API_BASE = resolveApiBase();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const finalUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const res = await fetch(finalUrl, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${res.status}] ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // novels
  listNovels: () => request<Novel[]>('/api/novels'),
  getNovel: (id: string) => request<Novel>(`/api/novels/${id}`),
  createNovel: (data: { title: string } & Partial<Novel>) =>
    request<Novel>('/api/novels', { method: 'POST', body: JSON.stringify(data) }),
  updateNovel: (id: string, data: Partial<Novel>) =>
    request<Novel>(`/api/novels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNovel: (id: string) =>
    request<{ ok: true }>(`/api/novels/${id}`, { method: 'DELETE' }),

  // settings
  listSettings: (novelId: string) =>
    request<SettingItem[]>(`/api/novels/${novelId}/settings`),
  createSetting: (novelId: string, data: { type: SettingType; name: string } & Partial<SettingItem>) =>
    request<SettingItem>(`/api/novels/${novelId}/settings`, { method: 'POST', body: JSON.stringify(data) }),
  updateSetting: (id: string, data: Partial<SettingItem>) =>
    request<SettingItem>(`/api/settings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSetting: (id: string) =>
    request<{ ok: true }>(`/api/settings/${id}`, { method: 'DELETE' }),

  // outline
  listOutline: (novelId: string) =>
    request<OutlineNode[]>(`/api/novels/${novelId}/outline`),
  createOutline: (novelId: string, data: { level: OutlineLevel; title: string } & Partial<OutlineNode>) =>
    request<OutlineNode>(`/api/novels/${novelId}/outline`, { method: 'POST', body: JSON.stringify(data) }),
  updateOutline: (id: string, data: Partial<OutlineNode>) =>
    request<OutlineNode>(`/api/outline/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOutline: (id: string) =>
    request<{ ok: true }>(`/api/outline/${id}`, { method: 'DELETE' }),

  // chapter plans
  listPlans: (novelId: string) =>
    request<ChapterPlan[]>(`/api/novels/${novelId}/chapter-plans`),
  createPlan: (novelId: string, data: Partial<ChapterPlan> & { chapterNumber: number }) =>
    request<ChapterPlan>(`/api/novels/${novelId}/chapter-plans`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id: string, data: Partial<ChapterPlan> & { ruleSet?: ChapterRuleSet }) =>
    request<ChapterPlan>(`/api/chapter-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlan: (id: string) =>
    request<{ ok: true }>(`/api/chapter-plans/${id}`, { method: 'DELETE' }),

  // draft
  getDraft: (planId: string) =>
    request<{ draft: any | null; versions: DraftVersion[]; current: DraftVersion | null }>(
      `/api/chapter-plans/${planId}/draft`
    ),
  saveManualDraft: (planId: string, content: string) =>
    request<{ draftId: string; versionId: string }>(
      `/api/chapter-plans/${planId}/draft/manual`,
      { method: 'POST', body: JSON.stringify({ content }) }
    ),
  previewPlan: (planId: string) =>
    request<{
      context: string;
      rules: string;
      resolvedRules: ChapterRuleSet;
      disabled?: Record<string, boolean>;
    }>(`/api/chapter-plans/${planId}/preview`),
  /**
   * Preview the context with transient overrides (not yet persisted).
   * Pass `overrides: null` to preview with no overrides (i.e. fully auto).
   * Pass `overrides: undefined` to use whatever is already saved on the plan.
   */
  previewPlanWithOverrides: (
    planId: string,
    overrides: ContextOverrides | null | undefined
  ) =>
    request<{
      context: string;
      rules: string;
      resolvedRules: ChapterRuleSet;
      disabled?: Record<string, boolean>;
    }>(`/api/chapter-plans/${planId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ contextOverrides: overrides ?? null }),
    }),
  generatePlan: (planId: string, params: { providerId?: string; temperature?: number } = {}) =>
    request<GenerateResult>(
      `/api/chapter-plans/${planId}/generate`,
      { method: 'POST', body: JSON.stringify(params) }
    ),

  // reviews
  listReviews: (planId: string) =>
    request<ReviewReport[]>(`/api/chapter-plans/${planId}/reviews`),

  // providers
  listProviders: () => request<ModelProvider[]>('/api/providers'),
  createProvider: (data: Partial<ModelProvider> & { name: string; baseUrl: string; model: string }) =>
    request<ModelProvider>('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateProvider: (id: string, data: Partial<ModelProvider>) =>
    request<ModelProvider>(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProvider: (id: string) =>
    request<{ ok: true }>(`/api/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/providers/${id}/test`, { method: 'POST' }),

  // chapter summaries
  listChapterSummaries: (novelId: string) =>
    request<ChapterSummary[]>(`/api/novels/${novelId}/chapter-summaries`),
  getChapterSummary: (planId: string) =>
    request<{ summary: ChapterSummary | null }>(`/api/chapter-plans/${planId}/summary`),
  summarizeChapter: (planId: string, params: { providerId?: string | null; versionId?: string } = {}) =>
    request<{
      summary: ChapterSummary;
      threadsCreated: number;
      threadsResolved: number;
      threadsUpdated: number;
      charactersTouched: number;
    }>(`/api/chapter-plans/${planId}/summarize`, { method: 'POST', body: JSON.stringify(params) }),

  // arc summaries
  listArcSummaries: (novelId: string) =>
    request<ArcSummary[]>(`/api/novels/${novelId}/arc-summaries`),
  createArcSummary: (novelId: string, data: {
    title: string;
    chapterPlanIds: string[];
    notes?: string | null;
    providerId?: string | null;
  }) => request<ArcSummary>(`/api/novels/${novelId}/arc-summaries`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateArcSummary: (id: string, data: Partial<Pick<ArcSummary, 'title' | 'brief' | 'keyThreads' | 'notes'>>) =>
    request<ArcSummary>(`/api/arc-summaries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArcSummary: (id: string) =>
    request<{ ok: true }>(`/api/arc-summaries/${id}`, { method: 'DELETE' }),

  // narrative threads
  listThreads: (novelId: string, status?: ThreadStatus) =>
    request<NarrativeThread[]>(
      `/api/novels/${novelId}/threads${status ? `?status=${status}` : ''}`
    ),
  createThread: (novelId: string, data: Partial<NarrativeThread>) =>
    request<NarrativeThread>(`/api/novels/${novelId}/threads`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateThread: (id: string, data: Partial<NarrativeThread>) =>
    request<NarrativeThread>(`/api/threads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteThread: (id: string) =>
    request<{ ok: true }>(`/api/threads/${id}`, { method: 'DELETE' }),

  // character states
  listCharacterStates: (novelId: string) =>
    request<CharacterState[]>(`/api/novels/${novelId}/character-states`),
  upsertCharacterState: (novelId: string, data: Partial<CharacterState>) =>
    request<CharacterState>(`/api/novels/${novelId}/character-states`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateCharacterState: (id: string, data: Partial<CharacterState>) =>
    request<CharacterState>(`/api/character-states/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  deleteCharacterState: (id: string) =>
    request<{ ok: true }>(`/api/character-states/${id}`, { method: 'DELETE' }),
};
