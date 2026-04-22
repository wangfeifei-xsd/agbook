import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api';
import type {
  ChapterPlan,
  ContextOverrides,
  ContextSectionMode,
} from '../types';

export type OverridesSaveStatus = 'idle' | 'dirty' | 'saving' | 'error';

interface Props {
  novelId: string;
  currentPlan: ChapterPlan;
  value: ContextOverrides;
  onChange: (next: ContextOverrides) => void;
  saveStatus?: OverridesSaveStatus;
  /** Epoch ms of the last successful save. */
  lastSavedAt?: number | null;
  saveError?: string | null;
  onRetrySave?: () => void;
  /** Reset the config back to "auto everywhere" (plus immediately save). */
  onResetToAuto?: () => void;
}

type Mode3 = ContextSectionMode;

const MODE3_LABEL: Record<Mode3, string> = {
  auto: '自动',
  manual: '手选',
  off: '关闭',
};

/** Pick the current section mode, defaulting to auto. */
function modeOf(spec: { mode?: Mode3 } | undefined): Mode3 {
  return (spec?.mode ?? 'auto') as Mode3;
}

function ModeToggle({
  modes,
  value,
  onChange,
  disabled,
}: {
  modes: Mode3[];
  value: Mode3;
  onChange: (next: Mode3) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded border border-ink-700 overflow-hidden text-xs shrink-0">
      {modes.map(m => (
        <button key={m} type="button" disabled={disabled}
          onClick={() => onChange(m)}
          className={`px-2 py-0.5 ${
            value === m
              ? 'bg-brand-600 text-white'
              : 'bg-ink-900 text-ink-300 hover:bg-ink-800'
          }`}>
          {MODE3_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/** Collapsible section shell. */
function Section({
  title,
  hint,
  mode,
  onModeChange,
  modes,
  children,
  badge,
}: {
  title: string;
  hint?: string;
  mode: Mode3;
  onModeChange: (next: Mode3) => void;
  modes: Mode3[];
  children?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-100 flex items-center gap-2">
            <span>{title}</span>
            {badge && <span className="tag text-[10px]">{badge}</span>}
          </div>
          {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
        </div>
        <ModeToggle modes={modes} value={mode} onChange={onModeChange} />
      </div>
      {mode !== 'auto' && children && (
        <div className="px-3 pb-3">{children}</div>
      )}
    </div>
  );
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function SaveStatusBar({
  status, lastSavedAt, error, onRetry, onReset, hasCustom,
}: {
  status: OverridesSaveStatus;
  lastSavedAt?: number | null;
  error?: string | null;
  onRetry?: () => void;
  onReset?: () => void;
  hasCustom: boolean;
}) {
  let text: React.ReactNode;
  let tone = 'text-ink-500';
  if (status === 'saving') {
    text = '保存中…';
    tone = 'text-ink-300';
  } else if (status === 'dirty') {
    text = '未保存 · 0.5s 后自动保存…';
    tone = 'text-yellow-300';
  } else if (status === 'error') {
    text = (
      <span>
        保存失败 · {error}
        <button type="button" className="btn btn-ghost text-[10px] px-1.5 py-0 ml-2"
          onClick={onRetry}>重试</button>
      </span>
    );
    tone = 'text-red-300';
  } else {
    text = lastSavedAt ? `已保存 · ${formatClock(lastSavedAt)}` : '已同步';
  }
  return (
    <div className={`flex items-center justify-between text-[11px] ${tone}`}>
      <span className="truncate">{text}</span>
      {hasCustom && onReset && (
        <button type="button" className="btn btn-ghost text-[10px] px-1.5 py-0"
          onClick={onReset} title="把所有块恢复为自动，并立即保存">
          恢复默认
        </button>
      )}
    </div>
  );
}

export function ContextOverridesPanel({
  novelId, currentPlan, value, onChange,
  saveStatus = 'idle', lastSavedAt = null, saveError = null,
  onRetrySave, onResetToAuto,
}: Props) {
  const hasCustom =
    (value.settings?.mode && value.settings.mode !== 'auto') ||
    (value.arcSummaries?.mode && value.arcSummaries.mode !== 'auto') ||
    (value.chapterSummaries?.mode && value.chapterSummaries.mode !== 'auto') ||
    (value.threads?.mode && value.threads.mode !== 'auto') ||
    (value.characters?.mode && value.characters.mode !== 'auto') ||
    value.chapterSummaries?.includeTail === false;

  // -- data sources for manual-mode lists --
  const { data: arcs = [] } = useQuery({
    queryKey: ['arcs', novelId],
    queryFn: () => api.listArcSummaries(novelId),
    enabled: !!novelId,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', novelId],
    queryFn: () => api.listPlans(novelId),
    enabled: !!novelId,
  });
  const { data: chapterSummaries = [] } = useQuery({
    queryKey: ['chapter-summaries', novelId],
    queryFn: () => api.listChapterSummaries(novelId),
    enabled: !!novelId,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ['threads', novelId, 'all'],
    queryFn: () => api.listThreads(novelId),
    enabled: !!novelId,
  });
  const { data: characters = [] } = useQuery({
    queryKey: ['characters', novelId],
    queryFn: () => api.listCharacterStates(novelId),
    enabled: !!novelId,
  });

  const priorPlans = useMemo(
    () => plans.filter(p => p.chapterNumber < currentPlan.chapterNumber)
      .sort((a, b) => b.chapterNumber - a.chapterNumber),
    [plans, currentPlan.chapterNumber]
  );
  const plansWithSummary = useMemo(
    () => new Set(chapterSummaries.map(s => s.chapterPlanId)),
    [chapterSummaries]
  );

  // -- helpers to mutate override keys --
  function setBlock<K extends keyof ContextOverrides>(key: K, patch: ContextOverrides[K]) {
    onChange({ ...value, [key]: patch });
  }

  // -- readable chip for current auto-selection size --
  const autoHint = {
    arc: `自动纳入早于第 ${currentPlan.chapterNumber} 章的全部卷/弧`,
    chap: '自动：最近 5 章（含 1 章尾段）+ 更早 brief 最多 12 条',
    thread: '自动：活跃伏笔按预期回收距离排序，最多 12 条',
    char: '自动：最多 8 个相关角色',
  };

  // ---------- Settings (auto/off) ----------
  const settingsMode = value.settings?.mode === 'off' ? 'off' : 'auto';

  // ---------- Arcs ----------
  const arcMode = modeOf(value.arcSummaries);
  const arcIds = new Set(value.arcSummaries?.arcIds ?? []);

  // ---------- Chapter summaries ----------
  const chapMode = modeOf(value.chapterSummaries);
  const chapIds = new Set(value.chapterSummaries?.planIds ?? []);
  const includeTail = value.chapterSummaries?.includeTail !== false;

  // ---------- Threads ----------
  const threadMode = modeOf(value.threads);
  const threadIds = new Set(value.threads?.threadIds ?? []);

  // ---------- Characters ----------
  const charMode = modeOf(value.characters);
  const charIds = new Set(value.characters?.stateIds ?? []);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-ink-900/80 backdrop-blur border-b border-ink-700">
        <SaveStatusBar
          status={saveStatus}
          lastSavedAt={lastSavedAt}
          error={saveError}
          onRetry={onRetrySave}
          onReset={onResetToAuto}
          hasCustom={!!hasCustom}
        />
      </div>
      <div className="text-[11px] text-ink-500 leading-5">
        每块可选 <b>自动</b>（默认策略）、<b>手选</b>（只注入你勾的条目）或 <b>关闭</b>（完全不注入）。
        配置保存在本章，重新生成会沿用。
      </div>

      {/* 设定 */}
      <Section
        title="相关设定"
        hint="按章节标题/目标匹配打分，辅以人物/世界观/规则。"
        mode={settingsMode}
        modes={['auto', 'off']}
        onModeChange={m => setBlock('settings', { mode: m as 'auto' | 'off' })}
      />

      {/* 卷/弧摘要 */}
      <Section
        title="卷 / 弧摘要"
        hint={autoHint.arc}
        mode={arcMode}
        modes={['auto', 'manual', 'off']}
        onModeChange={m => {
          const arcIdsArr = Array.from(arcIds);
          setBlock('arcSummaries', { mode: m, arcIds: m === 'manual' ? arcIdsArr : undefined });
        }}
        badge={arcMode === 'manual' ? `${arcIds.size} / ${arcs.length}` : undefined}>
        {arcs.length === 0 ? (
          <div className="text-xs text-ink-500">还没有卷/弧摘要。</div>
        ) : (
          <ul className="space-y-1 max-h-40 overflow-auto scrollbar-thin">
            {arcs.map(a => (
              <li key={a.id}>
                <label className="flex items-center gap-2 text-xs hover:bg-ink-800 rounded px-1 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={arcIds.has(a.id)}
                    onChange={() => setBlock('arcSummaries', {
                      mode: 'manual',
                      arcIds: Array.from(toggleInSet(arcIds, a.id)),
                    })} />
                  <span className="truncate flex-1">
                    <span className="text-ink-200">{a.title}</span>
                    {a.fromChapter != null && a.toChapter != null && (
                      <span className="text-ink-500 ml-1">（第 {a.fromChapter}–{a.toChapter} 章）</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 章节摘要 */}
      <Section
        title="章节摘要"
        hint={autoHint.chap}
        mode={chapMode}
        modes={['auto', 'manual', 'off']}
        onModeChange={m => setBlock('chapterSummaries', {
          mode: m,
          planIds: m === 'manual' ? Array.from(chapIds) : undefined,
          includeTail: value.chapterSummaries?.includeTail,
        })}
        badge={chapMode === 'manual' ? `${chapIds.size} / ${priorPlans.length}` : undefined}>
        <div className="mb-2">
          <label className="flex items-center gap-2 text-xs text-ink-300">
            <input type="checkbox" checked={includeTail}
              onChange={e => setBlock('chapterSummaries', {
                mode: chapMode,
                planIds: value.chapterSummaries?.planIds,
                includeTail: e.target.checked,
              })} />
            注入最近 1 章的尾段原文（约 800 字，用于承接行文）
          </label>
        </div>
        {chapMode === 'manual' && (
          priorPlans.length === 0 ? (
            <div className="text-xs text-ink-500">前面没有更早的章节。</div>
          ) : (
            <>
              <div className="flex gap-2 mb-1">
                <button type="button" className="btn btn-ghost text-xs"
                  onClick={() => setBlock('chapterSummaries', {
                    mode: 'manual',
                    planIds: priorPlans.filter(p => plansWithSummary.has(p.id)).map(p => p.id),
                    includeTail,
                  })}>全选（有摘要）</button>
                <button type="button" className="btn btn-ghost text-xs"
                  onClick={() => setBlock('chapterSummaries', {
                    mode: 'manual',
                    planIds: [],
                    includeTail,
                  })}>清空</button>
              </div>
              <ul className="space-y-1 max-h-48 overflow-auto scrollbar-thin">
                {priorPlans.map(p => {
                  const hasSummary = plansWithSummary.has(p.id);
                  return (
                    <li key={p.id}>
                      <label className={`flex items-center gap-2 text-xs rounded px-1 py-0.5 cursor-pointer ${
                        hasSummary ? 'hover:bg-ink-800' : 'opacity-50'
                      }`}>
                        <input type="checkbox" checked={chapIds.has(p.id)} disabled={!hasSummary}
                          onChange={() => setBlock('chapterSummaries', {
                            mode: 'manual',
                            planIds: Array.from(toggleInSet(chapIds, p.id)),
                            includeTail,
                          })} />
                        <span className="text-ink-500 w-12 text-right">第{p.chapterNumber}章</span>
                        <span className="truncate flex-1 text-ink-200">{p.title || '（无标题）'}</span>
                        {!hasSummary && <span className="text-[10px] text-ink-500">无摘要</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )
        )}
      </Section>

      {/* 活跃伏笔 */}
      <Section
        title="活跃伏笔 / 悬念"
        hint={autoHint.thread}
        mode={threadMode}
        modes={['auto', 'manual', 'off']}
        onModeChange={m => setBlock('threads', {
          mode: m,
          threadIds: m === 'manual' ? Array.from(threadIds) : undefined,
        })}
        badge={threadMode === 'manual' ? `${threadIds.size} / ${threads.length}` : undefined}>
        {threads.length === 0 ? (
          <div className="text-xs text-ink-500">还没有伏笔/悬念。</div>
        ) : (
          <>
            <ThreadFilterControls
              all={threads.map(t => t.id)}
              active={threads.filter(t => t.status === 'active').map(t => t.id)}
              selected={threadIds}
              onReplace={ids => setBlock('threads', { mode: 'manual', threadIds: ids })}
            />
            <ul className="space-y-1 max-h-48 overflow-auto scrollbar-thin">
              {threads.map(t => (
                <li key={t.id}>
                  <label className="flex items-start gap-2 text-xs hover:bg-ink-800 rounded px-1 py-0.5 cursor-pointer">
                    <input type="checkbox" checked={threadIds.has(t.id)}
                      className="mt-0.5"
                      onChange={() => setBlock('threads', {
                        mode: 'manual',
                        threadIds: Array.from(toggleInSet(threadIds, t.id)),
                      })} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="tag text-[10px]">{t.kind}</span>
                        <span className={`tag text-[10px] ${
                          t.status === 'resolved' ? 'bg-emerald-900/60 text-emerald-200'
                          : t.status === 'abandoned' ? 'bg-ink-700 text-ink-400'
                          : ''
                        }`}>{t.status}</span>
                        <span className="font-medium text-ink-200 truncate">{t.label}</span>
                      </div>
                      {t.detail && <div className="text-ink-400 truncate">{t.detail}</div>}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* 角色状态 */}
      <Section
        title="角色状态"
        hint={autoHint.char}
        mode={charMode}
        modes={['auto', 'manual', 'off']}
        onModeChange={m => setBlock('characters', {
          mode: m,
          stateIds: m === 'manual' ? Array.from(charIds) : undefined,
        })}
        badge={charMode === 'manual' ? `${charIds.size} / ${characters.length}` : undefined}>
        {characters.length === 0 ? (
          <div className="text-xs text-ink-500">还没有角色状态。</div>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-auto scrollbar-thin">
            {characters.map(c => (
              <li key={c.id}>
                <label className="flex items-start gap-2 text-xs hover:bg-ink-800 rounded px-1 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={charIds.has(c.id)}
                    className="mt-0.5"
                    onChange={() => setBlock('characters', {
                      mode: 'manual',
                      stateIds: Array.from(toggleInSet(charIds, c.id)),
                    })} />
                  <div className="flex-1 min-w-0">
                    <div className="text-ink-200 font-medium truncate">{c.name}</div>
                    <div className="text-ink-500 truncate">
                      {[c.location, c.condition].filter(Boolean).join(' · ')}
                      {c.lastUpdatedAtChapter != null ? ` · 上次第${c.lastUpdatedAtChapter}章更新` : ''}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ThreadFilterControls({
  all, active, selected, onReplace,
}: {
  all: string[];
  active: string[];
  selected: Set<string>;
  onReplace: (ids: string[]) => void;
}) {
  return (
    <div className="flex gap-2 mb-1">
      <button type="button" className="btn btn-ghost text-xs"
        onClick={() => onReplace(active)}>仅活跃</button>
      <button type="button" className="btn btn-ghost text-xs"
        onClick={() => onReplace(all)}>全选</button>
      <button type="button" className="btn btn-ghost text-xs"
        onClick={() => onReplace([])}>清空</button>
      <div className="text-xs text-ink-500 self-center ml-auto">已选 {selected.size}</div>
    </div>
  );
}
