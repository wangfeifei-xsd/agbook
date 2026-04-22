import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ContextOverridesPanel } from '../components/ContextOverridesPanel';
import { useToast } from '../components/Toast';
import type { ContextOverrides, DraftVersion, GenerateResult, ReviewIssue } from '../types';

const SEVERITY_COLOR: Record<string, string> = {
  info: 'bg-ink-700 text-ink-200',
  minor: 'bg-yellow-900/60 text-yellow-200',
  major: 'bg-orange-900/60 text-orange-200',
  critical: 'bg-red-900/70 text-red-200',
};

const SECTION_LABEL: Record<string, string> = {
  settings: '相关设定',
  arcSummaries: '卷/弧摘要',
  chapterSummaries: '章节摘要',
  threads: '活跃伏笔',
  characters: '角色状态',
};

/** True when any section has been explicitly changed away from auto-default. */
function hasCustomOverrides(o: ContextOverrides | null | undefined): boolean {
  if (!o) return false;
  const keys: (keyof ContextOverrides)[] = [
    'settings', 'arcSummaries', 'chapterSummaries', 'threads', 'characters',
  ];
  for (const k of keys) {
    const mode = (o as any)[k]?.mode;
    if (mode && mode !== 'auto') return true;
  }
  return false;
}

export function DraftPage() {
  const { novelId, planId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'preview' | 'review' | 'summary' | 'config' | 'versions'>('preview');
  const [lastResult, setLastResult] = useState<GenerateResult | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', novelId],
    queryFn: () => api.listPlans(novelId!),
    enabled: !!novelId,
  });
  const plan = plans.find(p => p.id === planId);

  const { data: draftData, refetch: refetchDraft } = useQuery({
    queryKey: ['draft', planId],
    queryFn: () => api.getDraft(planId!),
    enabled: !!planId,
  });

  useEffect(() => {
    if (draftData?.current?.content != null && !dirty) {
      setContent(draftData.current.content);
    }
    if (!draftData?.current) setContent('');
  }, [draftData?.current?.id]);

  // ----- Context overrides (per-chapter config) -----
  const [overrides, setOverrides] = useState<ContextOverrides>({});
  // Hydrate from plan once it loads / when plan changes.
  useEffect(() => {
    setOverrides(plan?.contextOverrides ?? {});
  }, [plan?.id]);

  const overridesKey = useMemo(() => JSON.stringify(overrides), [overrides]);

  const { data: preview } = useQuery({
    queryKey: ['preview', planId, overridesKey],
    queryFn: () => api.previewPlanWithOverrides(planId!, overrides),
    enabled: !!planId,
    // keep old preview visible while new one is computing
    placeholderData: prev => prev,
  });

  // ----- Auto-save of overrides with explicit status -----
  // dirty  – user changed something, debounce timer is pending
  // saving – PUT in flight
  // idle   – last PUT succeeded (or nothing to save)
  // error  – last PUT failed; user can click "重试" to re-kick
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedRef = useRef<string>('');
  const saveSeqRef = useRef(0);

  // Re-sync "last saved" marker whenever we switch chapters.
  useEffect(() => {
    if (!plan) return;
    lastSavedRef.current = JSON.stringify(plan.contextOverrides ?? {});
    setSaveStatus('idle');
    setLastSavedAt(null);
    setSaveError(null);
  }, [plan?.id]);

  const doSave = async (seq: number) => {
    if (!planId) return;
    setSaveStatus('saving');
    try {
      await api.updatePlan(planId, { contextOverrides: overrides });
      // Stale request guard: only accept the result of the latest attempt.
      if (seq !== saveSeqRef.current) return;
      lastSavedRef.current = overridesKey;
      setSaveStatus('idle');
      setLastSavedAt(Date.now());
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['plans', novelId] });
    } catch (e) {
      if (seq !== saveSeqRef.current) return;
      setSaveStatus('error');
      setSaveError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!planId) return;
    if (overridesKey === lastSavedRef.current) return;
    setSaveStatus('dirty');
    setSaveError(null);
    const seq = ++saveSeqRef.current;
    const handle = window.setTimeout(() => { doSave(seq); }, 500);
    return () => window.clearTimeout(handle);
  }, [overridesKey, planId]);

  const retrySave = () => {
    const seq = ++saveSeqRef.current;
    doSave(seq);
  };

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', planId],
    queryFn: () => api.listReviews(planId!),
    enabled: !!planId,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: api.listProviders,
  });
  const [providerId, setProviderId] = useState<string>('');
  useEffect(() => {
    if (!providerId && providers.length) {
      const def = providers.find(p => p.isDefault) ?? providers[0];
      setProviderId(def.id);
    }
  }, [providers, providerId]);

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['summary', planId],
    queryFn: () => api.getChapterSummary(planId!),
    enabled: !!planId,
  });

  const generateMut = useMutation({
    mutationFn: () => api.generatePlan(planId!, { providerId: providerId || undefined }),
    onSuccess: (result) => {
      setLastResult(result);
      setContent(result.content);
      setDirty(false);
      refetchDraft();
      refetchSummary();
      qc.invalidateQueries({ queryKey: ['reviews', planId] });
      qc.invalidateQueries({ queryKey: ['plans', novelId] });
      qc.invalidateQueries({ queryKey: ['threads', novelId] });
      qc.invalidateQueries({ queryKey: ['characters', novelId] });
      setTab('review');
      if (result.summary?.ok) {
        toast.success('章节已生成，摘要/伏笔/角色状态已自动更新');
      } else if (result.summary && !result.summary.ok) {
        toast.error(`章节已生成，但摘要失败：${result.summary.message ?? '未知错误'}`);
      } else {
        toast.success('章节已生成');
      }
    },
    onError: (e) => {
      toast.error(`生成失败：${(e as Error).message}`);
    },
  });

  const saveMut = useMutation({
    mutationFn: () => api.saveManualDraft(planId!, content),
    onSuccess: () => {
      setDirty(false);
      refetchDraft();
      qc.invalidateQueries({ queryKey: ['plans', novelId] });
      toast.success('手动修改已保存');
    },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  const deleteVersionMut = useMutation({
    mutationFn: (versionId: string) => api.deleteDraftVersion(versionId),
    onSuccess: () => {
      refetchDraft();
      refetchSummary();
      toast.success('版本已删除');
    },
    onError: (e) => toast.error(`删除失败：${(e as Error).message}`),
  });

  const pruneVersionsMut = useMutation({
    mutationFn: (keep: number) => api.pruneDraftVersions(planId!, keep),
    onSuccess: (res) => {
      refetchDraft();
      refetchSummary();
      toast.success(`已清理 ${res.removed} 个历史版本`);
    },
    onError: (e) => toast.error(`清理失败：${(e as Error).message}`),
  });

  const deleteReviewMut = useMutation({
    mutationFn: (reviewId: string) => api.deleteReview(reviewId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', planId] });
      toast.success('审核记录已删除');
    },
    onError: (e) => toast.error(`删除失败：${(e as Error).message}`),
  });

  const pruneReviewsMut = useMutation({
    mutationFn: (keep: number) => api.pruneReviewsForPlan(planId!, keep),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reviews', planId] });
      toast.success(`已清理 ${res.removed} 条审核记录`);
    },
    onError: (e) => toast.error(`清理失败：${(e as Error).message}`),
  });

  const deleteSummariesMut = useMutation({
    mutationFn: () => api.deleteChapterSummariesForPlan(planId!),
    onSuccess: (res) => {
      refetchSummary();
      toast.success(`已删除 ${res.removed} 条摘要记录`);
    },
    onError: (e) => toast.error(`删除失败：${(e as Error).message}`),
  });

  const summarizeMut = useMutation({
    mutationFn: () => api.summarizeChapter(planId!),
    onSuccess: (res) => {
      refetchSummary();
      qc.invalidateQueries({ queryKey: ['threads', novelId] });
      qc.invalidateQueries({ queryKey: ['characters', novelId] });
      const parts: string[] = [];
      if (res.threadsCreated) parts.push(`新增伏笔 ${res.threadsCreated}`);
      if (res.threadsResolved) parts.push(`回收 ${res.threadsResolved}`);
      if (res.threadsUpdated) parts.push(`更新伏笔 ${res.threadsUpdated}`);
      if (res.charactersTouched) parts.push(`角色 ${res.charactersTouched}`);
      toast.success(parts.length ? `摘要已更新 · ${parts.join('，')}` : '摘要已更新');
    },
    onError: (e) => toast.error(`摘要失败：${(e as Error).message}`),
  });

  const wordCount = useMemo(() => {
    const cjk = content.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const alpha = content.match(/[A-Za-z0-9]+/g)?.length ?? 0;
    return cjk + alpha;
  }, [content]);

  const lastReview = reviews[0];
  const lastIssues: ReviewIssue[] = lastResult?.review.issues ?? lastReview?.issues ?? [];
  const lastResult2 = lastResult?.review.result ?? lastReview?.result;

  if (!plan) return <div className="p-8 text-ink-500">章节计划不存在。</div>;

  return (
    <div className="h-full grid grid-cols-[1fr_420px]">
      <div className="flex flex-col min-h-0">
        <div className="px-6 py-3 border-b border-ink-700 flex items-center justify-between bg-ink-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/novels/${novelId}/plans`}
              className="btn btn-ghost text-base px-2"
              title="返回章节计划列表"
              aria-label="返回">
              ←
            </Link>
            <div className="min-w-0">
              <div className="text-xs text-ink-400">
                <Link to={`/novels/${novelId}/plans`} className="hover:text-ink-100">章节计划</Link>
                <span className="mx-2">/</span>
                <span>第 {plan.chapterNumber} 章</span>
              </div>
              <div className="font-semibold truncate">{plan.title || '（无标题）'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-400">{wordCount} 字</span>
            {plan.targetWordCount && (
              <span className="text-ink-500">· 目标 {plan.targetWordCount}</span>
            )}
            {plan.minWordCount || plan.maxWordCount ? (
              <span className="text-ink-500">· 区间 {plan.minWordCount ?? '—'}–{plan.maxWordCount ?? '—'}</span>
            ) : null}
            {dirty && <span className="tag">未保存</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-6">
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setDirty(true); }}
            className="input h-full resize-none font-mono text-[15px] leading-8"
            placeholder="正文内容…（可直接手动编辑，或点击右侧「生成本章」自动生成）" />
        </div>

        <div className="px-6 py-3 border-t border-ink-700 bg-ink-900/60 flex items-center justify-between">
          <div className="text-xs text-ink-500">
            {draftData?.current
              ? `当前版本 v${draftData.current.versionNumber} · ${new Date(draftData.current.createdAt).toLocaleString()}`
              : '尚无草稿版本'}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={!dirty || saveMut.isPending}
              onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? '保存中…' : '保存手动修改'}
            </button>
          </div>
        </div>
      </div>

      <aside className="border-l border-ink-700 flex flex-col min-h-0 bg-ink-900/40">
        <div className="p-4 border-b border-ink-700">
          <label className="label">使用模型</label>
          <select className="input mb-3" value={providerId}
            onChange={e => setProviderId(e.target.value)}>
            {providers.length === 0 && <option value="">（请先在「模型配置」中添加）</option>}
            {providers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.model}{p.isDefault ? ' (默认)' : ''}</option>)}
          </select>
          <button className="btn btn-primary w-full"
            disabled={!providerId || generateMut.isPending}
            onClick={() => generateMut.mutate()}>
            {generateMut.isPending ? '生成中…（可能需要数十秒）' : '生成本章'}
          </button>
          {generateMut.isError && (
            <div className="mt-2 text-xs text-red-400">
              {(generateMut.error as Error)?.message}
            </div>
          )}
        </div>

        <div className="border-b border-ink-700 flex">
          <button className={`flex-1 py-2 text-xs ${tab === 'preview' ? 'bg-ink-800 text-brand-500' : 'text-ink-300'}`}
            onClick={() => setTab('preview')}>上下文预览</button>
          <button className={`flex-1 py-2 text-xs ${tab === 'config' ? 'bg-ink-800 text-brand-500' : 'text-ink-300'}`}
            onClick={() => setTab('config')}>
            注入配置
            {hasCustomOverrides(overrides) && <span className="ml-1 text-[10px] text-brand-400">●</span>}
          </button>
          <button className={`flex-1 py-2 text-xs ${tab === 'summary' ? 'bg-ink-800 text-brand-500' : 'text-ink-300'}`}
            onClick={() => setTab('summary')}>
            本章摘要
            {summaryData?.summary && <span className="ml-1 text-[10px] text-emerald-400">●</span>}
          </button>
          <button className={`flex-1 py-2 text-xs ${tab === 'review' ? 'bg-ink-800 text-brand-500' : 'text-ink-300'}`}
            onClick={() => setTab('review')}>
            审核结果
            {lastIssues.length > 0 && <span className="ml-1 text-[10px] text-red-400">· {lastIssues.length}</span>}
          </button>
          <button className={`flex-1 py-2 text-xs ${tab === 'versions' ? 'bg-ink-800 text-brand-500' : 'text-ink-300'}`}
            onClick={() => setTab('versions')}>
            版本
            {(draftData?.versions?.length ?? 0) > 0 && (
              <span className="ml-1 text-[10px] text-ink-400">· {draftData!.versions.length}</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin p-4 text-sm">
          {tab === 'config' ? (
            <ContextOverridesPanel
              novelId={novelId!}
              currentPlan={plan}
              value={overrides}
              onChange={setOverrides}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              saveError={saveError}
              onRetrySave={retrySave}
              onResetToAuto={() => setOverrides({})}
            />
          ) : tab === 'preview' ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-ink-400 mb-1">规则块（将发送给模型）</div>
                <pre className="whitespace-pre-wrap text-ink-200 bg-ink-900 rounded p-3 border border-ink-700 text-xs leading-6">
{preview?.rules}
                </pre>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-ink-400">上下文块</div>
                <button className="btn btn-ghost text-[10px] px-2 py-0.5"
                  onClick={() => setTab('config')}
                  title="进入注入配置页，按章定制伏笔/角色/摘要等">
                  自定义注入 →
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-ink-200 bg-ink-900 rounded p-3 border border-ink-700 text-xs leading-6">
{preview?.context}
              </pre>
              {preview?.disabled && Object.keys(preview.disabled).some(k => (preview.disabled as any)[k]) && (
                <div className="text-[11px] text-ink-500">
                  已关闭：{Object.entries(preview.disabled).filter(([, v]) => v).map(([k]) => SECTION_LABEL[k] ?? k).join('、')}
                </div>
              )}
            </div>
          ) : tab === 'summary' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-ink-400">
                  {summaryData?.summary
                    ? `绑定版本 v${draftData?.versions.find(v => v.id === summaryData.summary!.draftVersionId)?.versionNumber ?? '?'} · ${new Date(summaryData.summary.updatedAt).toLocaleString()}`
                    : '当前章节尚无摘要'}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost text-xs"
                    disabled={!draftData?.current || summarizeMut.isPending}
                    onClick={() => summarizeMut.mutate()}>
                    {summarizeMut.isPending ? '总结中…' : (summaryData?.summary ? '重新总结' : '生成本章摘要')}
                  </button>
                  {summaryData?.summary && (
                    <button className="btn btn-ghost text-xs text-red-300 hover:text-red-400"
                      disabled={deleteSummariesMut.isPending}
                      onClick={() => {
                        if (confirm('删除本章所有摘要记录？生成过程依赖的是最近一条，其余历史记录可安全清理。')) {
                          deleteSummariesMut.mutate();
                        }
                      }}>
                      {deleteSummariesMut.isPending ? '清理中…' : '清空摘要'}
                    </button>
                  )}
                </div>
              </div>
              {!draftData?.current && (
                <div className="text-ink-500">当前章节没有已保存的正文版本，无法生成摘要。</div>
              )}
              {summaryData?.summary ? (
                <>
                  <div>
                    <div className="text-xs text-ink-400 mb-1">brief</div>
                    <div className="bg-ink-900 border border-ink-700 rounded p-3 leading-6">
                      {summaryData.summary.brief}
                    </div>
                  </div>
                  {summaryData.summary.keyEvents.length > 0 && (
                    <div>
                      <div className="text-xs text-ink-400 mb-1">key events</div>
                      <ul className="space-y-1">
                        {summaryData.summary.keyEvents.map((ev, idx) => (
                          <li key={idx} className="bg-ink-900 border border-ink-700 rounded p-2">
                            {ev.who && <span className="text-brand-400 mr-1">{ev.who}：</span>}
                            <span>{ev.what}</span>
                            {(ev.where || ev.when) && (
                              <span className="ml-2 text-xs text-ink-500">
                                {ev.where ? `@${ev.where} ` : ''}{ev.when ?? ''}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryData.summary.stateChanges.length > 0 && (
                    <div>
                      <div className="text-xs text-ink-400 mb-1">state changes</div>
                      <ul className="space-y-1 text-xs">
                        {summaryData.summary.stateChanges.map((sc, idx) => (
                          <li key={idx} className="text-ink-200">
                            <span className="text-ink-400">{sc.target}：</span>{sc.change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryData.summary.openQuestions.length > 0 && (
                    <div>
                      <div className="text-xs text-ink-400 mb-1">open questions</div>
                      <ul className="space-y-1 text-xs list-disc list-inside text-ink-200">
                        {summaryData.summary.openQuestions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
              {summarizeMut.isError && (
                <div className="text-xs text-red-400">
                  {(summarizeMut.error as Error)?.message}
                </div>
              )}
            </div>
          ) : tab === 'review' ? (
            <div className="space-y-3">
              {lastResult2 && (
                <div className={`rounded px-3 py-2 text-sm ${
                  lastResult2 === 'pass' ? 'bg-emerald-900/50 text-emerald-200'
                  : lastResult2 === 'warn' ? 'bg-yellow-900/60 text-yellow-200'
                  : 'bg-red-900/60 text-red-200'
                }`}>
                  审核结论：{lastResult2 === 'pass' ? '通过' : lastResult2 === 'warn' ? '有待完善' : '不通过'}
                </div>
              )}
              {lastIssues.length === 0 ? (
                <div className="text-ink-500">暂无规则问题。点击「生成本章」后这里会列出自动审核结果。</div>
              ) : (
                <ul className="space-y-2">
                  {lastIssues.map((iss, idx) => (
                    <li key={idx} className="bg-ink-900 border border-ink-700 rounded p-3">
                      <div className="flex items-center gap-2">
                        <span className={`tag ${SEVERITY_COLOR[iss.severity] || ''}`}>{iss.severity}</span>
                        <span className="text-xs text-ink-400">{iss.ruleSource ?? iss.type}</span>
                      </div>
                      <div className="mt-1 text-ink-100">{iss.message}</div>
                      {iss.suggestion && <div className="mt-1 text-xs text-ink-400">建议：{iss.suggestion}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {reviews.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mt-4 mb-2">
                    <div className="text-xs text-ink-400">历史审核 · 共 {reviews.length} 条</div>
                    {reviews.length > 3 && (
                      <button className="btn btn-ghost text-[10px] px-2 py-0.5 text-ink-400 hover:text-red-400"
                        disabled={pruneReviewsMut.isPending}
                        onClick={() => {
                          if (confirm(`仅保留最近 3 条审核记录，删除其余 ${reviews.length - 3} 条？`)) {
                            pruneReviewsMut.mutate(3);
                          }
                        }}>
                        {pruneReviewsMut.isPending ? '清理中…' : '只保留最近3条'}
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {reviews.map(r => (
                      <li key={r.id} className="text-xs text-ink-400 flex items-center justify-between gap-2 bg-ink-900/60 border border-ink-800 rounded px-2 py-1">
                        <span className="truncate">
                          {new Date(r.createdAt).toLocaleString()} · {r.result} · {r.issues.length} 项问题
                        </span>
                        <button className="text-ink-500 hover:text-red-400 shrink-0"
                          disabled={deleteReviewMut.isPending}
                          onClick={() => {
                            if (confirm('删除这条审核记录？')) deleteReviewMut.mutate(r.id);
                          }}>
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <VersionsPanel
              versions={draftData?.versions ?? []}
              currentVersionId={draftData?.current?.id ?? null}
              onDelete={(id) => deleteVersionMut.mutate(id)}
              onPrune={(keep) => pruneVersionsMut.mutate(keep)}
              deletingId={deleteVersionMut.isPending ? (deleteVersionMut.variables as string) : null}
              isPruning={pruneVersionsMut.isPending}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function VersionsPanel({
  versions,
  currentVersionId,
  onDelete,
  onPrune,
  deletingId,
  isPruning,
}: {
  versions: DraftVersion[];
  currentVersionId: string | null;
  onDelete: (id: string) => void;
  onPrune: (keep: number) => void;
  deletingId: string | null;
  isPruning: boolean;
}) {
  if (versions.length === 0) {
    return <div className="text-ink-500 text-sm">尚无草稿版本。每次「生成本章」或手动保存都会产生一个新版本。</div>;
  }
  const excess = versions.length - 5;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-400">共 {versions.length} 个版本</div>
        {excess > 0 && (
          <button className="btn btn-ghost text-[10px] px-2 py-0.5 text-ink-400 hover:text-red-400"
            disabled={isPruning}
            onClick={() => {
              if (confirm(`仅保留最近 5 个版本（当前版本不会被删），清理其余 ${excess} 个？\n\n注：每个历史版本都保存了完整章节正文，章节越多冗余占用越大。`)) {
                onPrune(5);
              }
            }}>
            {isPruning ? '清理中…' : '只保留最近5个'}
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {versions.map(v => {
          const isCurrent = v.id === currentVersionId;
          const chars = v.content?.length ?? 0;
          return (
            <li key={v.id}
              className={`flex items-center justify-between gap-2 border rounded px-2 py-1.5 text-xs
                ${isCurrent ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900/60'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ink-200 font-medium">v{v.versionNumber}</span>
                  {isCurrent && <span className="tag bg-brand-600/30 text-brand-200">当前</span>}
                  <span className="tag">{v.sourceType}</span>
                </div>
                <div className="text-ink-500 mt-0.5 truncate">
                  {new Date(v.createdAt).toLocaleString()} · {chars.toLocaleString()} 字符
                </div>
              </div>
              <button className="text-ink-500 hover:text-red-400 shrink-0"
                disabled={deletingId === v.id}
                title={isCurrent ? '删除当前版本后，将自动回退到更早的一个版本' : '删除此历史版本'}
                onClick={() => {
                  const msg = isCurrent
                    ? '此版本是当前显示版本。删除后会自动回退到更早的版本。确认删除？'
                    : `删除 v${v.versionNumber}？`;
                  if (confirm(msg)) onDelete(v.id);
                }}>
                {deletingId === v.id ? '…' : '删除'}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="text-[11px] text-ink-500 leading-5">
        提示：每个版本都保存了完整章节正文，章节多了后占用会显著增长。「只保留最近 N 个」会批量清理历史版本，当前显示版本始终保留。
      </div>
    </div>
  );
}
