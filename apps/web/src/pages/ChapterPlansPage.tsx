import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { PolishButton } from '../components/PolishButton';
import { usePolish, type PolishPurpose } from '../hooks/usePolish';
import type { ChapterPlan, ChapterRuleSet } from '../types';

type PlanPolishField =
  | 'summary'
  | 'goal'
  | 'mustInclude'
  | 'mustAvoid'
  | 'continuity'
  | 'extra';

const PLAN_POLISH_PURPOSE: Record<PlanPolishField, PolishPurpose> = {
  summary: 'outlineSummary',
  goal: 'outlineGoal',
  mustInclude: 'chapterMustInclude',
  mustAvoid: 'chapterMustAvoid',
  continuity: 'chapterContinuity',
  extra: 'chapterExtraInstructions',
};

const STATUS_LABEL: Record<ChapterPlan['status'], string> = {
  planned: '待生成',
  generating: '生成中',
  drafted: '已生成',
  reviewing: '待复核',
  finalized: '已定稿',
};

export function ChapterPlansPage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', novelId],
    queryFn: () => api.listPlans(novelId!),
    enabled: !!novelId,
  });
  const { data: outline = [] } = useQuery({
    queryKey: ['outline', novelId],
    queryFn: () => api.listOutline(novelId!),
    enabled: !!novelId,
  });

  const nextNumber = useMemo(
    () => (plans[plans.length - 1]?.chapterNumber ?? 0) + 1,
    [plans]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && plans.length) setSelectedId(plans[0].id);
  }, [plans, selectedId]);
  const selected = plans.find(p => p.id === selectedId) ?? null;

  const createMut = useMutation({
    mutationFn: () => api.createPlan(novelId!, {
      chapterNumber: nextNumber,
      title: `第 ${nextNumber} 章`,
      targetWordCount: 3000,
      minWordCount: 2400,
      maxWordCount: 3600,
      ruleSet: {},
    }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['plans', novelId] });
      setSelectedId(p.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans', novelId] }),
  });

  return (
    <div className="h-full grid grid-cols-[380px_1fr]">
      <div className="border-r border-ink-700 overflow-auto scrollbar-thin p-3 bg-ink-900/40">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">章节计划</h3>
          <button className="btn btn-primary text-xs" onClick={() => createMut.mutate()}>
            + 新增一章
          </button>
        </div>
        {plans.length === 0 ? (
          <div className="text-ink-500 text-sm px-2">还没有章节计划。</div>
        ) : (
          <ul className="space-y-1">
            {plans.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedId === p.id ? 'bg-ink-700 border border-brand-500' : 'bg-ink-800/50 hover:bg-ink-700'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">第 {p.chapterNumber} 章 · {p.title || '（无标题）'}</span>
                    <span className="text-xs text-ink-400">{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div className="text-xs text-ink-400 mt-1">
                    目标 {p.targetWordCount ?? '—'} 字 · 区间 {p.minWordCount ?? '—'}–{p.maxWordCount ?? '—'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-auto scrollbar-thin">
        {selected ? (
          <PlanEditor
            key={selected.id}
            plan={selected}
            outlineOptions={outline}
            onSave={data => updatePlan(qc, novelId!, selected.id, data)}
            onDelete={async () => {
              if (await confirm({
                title: '删除章节计划',
                message: `确定删除「第 ${selected.chapterNumber} 章 · ${selected.title || '未命名'}」？\n该章节的所有草稿版本、审核记录、摘要都会被一并删除。`,
                confirmText: '删除',
                tone: 'danger',
              })) {
                deleteMut.mutate(selected.id);
              }
            }}
          />
        ) : (
          <div className="p-8 text-ink-500">左侧没有可编辑的章节计划。</div>
        )}
      </div>
    </div>
  );
}

async function updatePlan(qc: any, novelId: string, id: string, data: Partial<ChapterPlan>) {
  await api.updatePlan(id, data);
  qc.invalidateQueries({ queryKey: ['plans', novelId] });
}

function PlanEditor({ plan, outlineOptions, onSave, onDelete }: {
  plan: ChapterPlan;
  outlineOptions: { id: string; title: string; level: string }[];
  onSave: (data: Partial<ChapterPlan>) => Promise<void> | void;
  onDelete: () => void;
}) {
  const { novelId } = useParams();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    chapterNumber: plan.chapterNumber,
    title: plan.title ?? '',
    summary: plan.summary ?? '',
    goal: plan.goal ?? '',
    outlineNodeId: plan.outlineNodeId ?? '',
    targetWordCount: plan.targetWordCount ?? '',
    minWordCount: plan.minWordCount ?? '',
    maxWordCount: plan.maxWordCount ?? '',
  });
  const [rule, setRule] = useState<ChapterRuleSet>({ ...plan.ruleSet });
  const [mustIncludeText, setMustIncludeText] = useState((plan.ruleSet.mustIncludePoints ?? []).join('\n'));
  const [mustAvoidText, setMustAvoidText] = useState((plan.ruleSet.mustAvoidPoints ?? []).join('\n'));

  const confirm = useConfirm();

  const { polish, polishing } = usePolish(novelId);
  const chapterHint = () => {
    const parts: string[] = [`章节：第 ${form.chapterNumber} 章`];
    if (form.title.trim()) parts.push(`标题：${form.title.trim()}`);
    return parts.join(' · ');
  };
  const handlePolish = async (field: PlanPolishField, label: string, getCurrent: () => string, setNext: (text: string) => void) => {
    const text = await polish({
      key: field,
      label,
      current: getCurrent(),
      purpose: PLAN_POLISH_PURPOSE[field],
      hint: chapterHint(),
    });
    if (text !== null) setNext(text);
  };

  // Only chapters that already have a generated body should offer AI title
  // suggestions, since we feed the draft content to the model. We still
  // allow 'reviewing' / 'finalized' since the draft is present in those.
  const hasDraftContent =
    plan.status === 'drafted' ||
    plan.status === 'reviewing' ||
    plan.status === 'finalized';
  const [suggestingTitle, setSuggestingTitle] = useState(false);
  const handleSuggestTitle = async () => {
    if (!hasDraftContent) {
      toast.info('当前章节尚未生成正文，无法基于内容起标题');
      return;
    }
    try {
      setSuggestingTitle(true);
      const res = await api.suggestChapterTitle(plan.id);
      if (!res.title || res.title === form.title.trim()) {
        toast.info(res.title ? '建议标题与当前标题一致' : '模型未返回标题，请稍后重试');
        return;
      }
      const ok = await confirm({
        title: 'AI 起标题 · 预览',
        message:
          `模型：${res.providerName} · ${res.model}\n` +
          `分析正文字数：${res.contentChars}\n\n` +
          `建议标题：\n${res.title}\n\n` +
          `确认替换当前标题？（替换后仍需点"保存章节计划"才会写入数据库）`,
        confirmText: '替换',
        cancelText: '放弃',
        tone: 'primary',
      });
      if (ok) {
        setForm(prev => ({ ...prev, title: res.title }));
        toast.success('标题已更新');
      }
    } catch (e) {
      toast.error(`起标题失败：${(e as Error).message}`);
    } finally {
      setSuggestingTitle(false);
    }
  };

  const save = async () => {
    if (saving) return;
    const rules: ChapterRuleSet = {
      ...rule,
      mustIncludePoints: mustIncludeText.split('\n').map(s => s.trim()).filter(Boolean),
      mustAvoidPoints: mustAvoidText.split('\n').map(s => s.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      await onSave({
        chapterNumber: Number(form.chapterNumber),
        title: form.title,
        summary: form.summary,
        goal: form.goal,
        outlineNodeId: form.outlineNodeId || null,
        targetWordCount: form.targetWordCount === '' ? null : Number(form.targetWordCount),
        minWordCount: form.minWordCount === '' ? null : Number(form.minWordCount),
        maxWordCount: form.maxWordCount === '' ? null : Number(form.maxWordCount),
        ruleSet: rules,
      });
      toast.success('章节计划已保存');
    } catch (err: any) {
      toast.error(`保存失败：${err?.message ?? '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">第 {plan.chapterNumber} 章 · {plan.title || '未命名'}</h2>
        <div className="flex gap-2">
          <Link className="btn btn-ghost" to={`/novels/${novelId}/plans/${plan.id}`}>
            打开草稿 / 生成
          </Link>
          <button className="btn btn-danger" onClick={onDelete}>删除</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">章节编号</label>
          <input type="number" className="input" value={form.chapterNumber}
            onChange={e => setForm({ ...form, chapterNumber: Number(e.target.value) })} />
        </div>
        <div>
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>标题</label>
            <PolishButton
              label="AI 起标题"
              title={
                hasDraftContent
                  ? '根据本章已生成的正文让 AI 建议一个章节标题'
                  : '需要先生成本章正文（drafted / reviewing / finalized 状态），才能基于内容起标题'
              }
              disabled={!hasDraftContent || suggestingTitle}
              loading={suggestingTitle}
              onClick={handleSuggestTitle}
            />
          </div>
          <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>章节摘要</label>
            <PolishButton
              disabled={!form.summary?.trim() || polishing !== null}
              loading={polishing === 'summary'}
              onClick={() => handlePolish(
                'summary', '章节摘要',
                () => form.summary,
                text => setForm(prev => ({ ...prev, summary: text })),
              )}
            />
          </div>
          <textarea className="input" rows={3} value={form.summary}
            disabled={polishing === 'summary'}
            onChange={e => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>本章目标 / 必须发生</label>
            <PolishButton
              disabled={!form.goal?.trim() || polishing !== null}
              loading={polishing === 'goal'}
              onClick={() => handlePolish(
                'goal', '本章目标',
                () => form.goal,
                text => setForm(prev => ({ ...prev, goal: text })),
              )}
            />
          </div>
          <textarea className="input" rows={2} value={form.goal}
            disabled={polishing === 'goal'}
            onChange={e => setForm({ ...form, goal: e.target.value })} />
        </div>
        <div>
          <label className="label">关联大纲节点</label>
          <select className="input" value={form.outlineNodeId}
            onChange={e => setForm({ ...form, outlineNodeId: e.target.value })}>
            <option value="">（不关联）</option>
            {outlineOptions.map(n => <option key={n.id} value={n.id}>[{n.level}] {n.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">目标字数</label>
            <input type="number" className="input" value={form.targetWordCount}
              onChange={e => setForm({ ...form, targetWordCount: e.target.value as any })} />
          </div>
          <div>
            <label className="label">最低</label>
            <input type="number" className="input" value={form.minWordCount}
              onChange={e => setForm({ ...form, minWordCount: e.target.value as any })} />
          </div>
          <div>
            <label className="label">最高</label>
            <input type="number" className="input" value={form.maxWordCount}
              onChange={e => setForm({ ...form, maxWordCount: e.target.value as any })} />
          </div>
        </div>
      </div>

      <h3 className="font-semibold mt-6 mb-3">章节生成规则</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">叙事视角</label>
          <select className="input" value={rule.narrativePerspective ?? ''}
            onChange={e => setRule({ ...rule, narrativePerspective: e.target.value || undefined })}>
            <option value="">（不限制）</option>
            <option value="first">第一人称</option>
            <option value="third">第三人称</option>
            <option value="omniscient">全知视角</option>
          </select>
        </div>
        <div>
          <label className="label">文风 / 语气</label>
          <input className="input" value={rule.toneStyle ?? ''}
            onChange={e => setRule({ ...rule, toneStyle: e.target.value || undefined })}
            placeholder="冷峻 / 诙谐 / 紧张 / 克制 …" />
        </div>
        <div>
          <label className="label">对白比例倾向</label>
          <select className="input" value={rule.dialogueRatioPreference ?? ''}
            onChange={e => setRule({ ...rule, dialogueRatioPreference: (e.target.value || undefined) as any })}>
            <option value="">（不限制）</option>
            <option value="low">少</option>
            <option value="medium">适中</option>
            <option value="high">多</option>
          </select>
        </div>
        <div>
          <label className="label">描写比例倾向</label>
          <select className="input" value={rule.descriptionRatioPreference ?? ''}
            onChange={e => setRule({ ...rule, descriptionRatioPreference: (e.target.value || undefined) as any })}>
            <option value="">（不限制）</option>
            <option value="low">少</option>
            <option value="medium">适中</option>
            <option value="high">多</option>
          </select>
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>必须出现的情节点（每行一条）</label>
            <PolishButton
              disabled={!mustIncludeText.trim() || polishing !== null}
              loading={polishing === 'mustInclude'}
              onClick={() => handlePolish(
                'mustInclude', '必须出现的情节点',
                () => mustIncludeText,
                text => setMustIncludeText(text),
              )}
            />
          </div>
          <textarea className="input" rows={3} value={mustIncludeText}
            disabled={polishing === 'mustInclude'}
            onChange={e => setMustIncludeText(e.target.value)} />
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>禁止出现的内容（每行一条）</label>
            <PolishButton
              disabled={!mustAvoidText.trim() || polishing !== null}
              loading={polishing === 'mustAvoid'}
              onClick={() => handlePolish(
                'mustAvoid', '禁止出现的内容',
                () => mustAvoidText,
                text => setMustAvoidText(text),
              )}
            />
          </div>
          <textarea className="input" rows={3} value={mustAvoidText}
            disabled={polishing === 'mustAvoid'}
            onChange={e => setMustAvoidText(e.target.value)} />
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>连续性要求（需承接的信息）</label>
            <PolishButton
              disabled={!rule.continuityRequirements?.trim() || polishing !== null}
              loading={polishing === 'continuity'}
              onClick={() => handlePolish(
                'continuity', '连续性要求',
                () => rule.continuityRequirements ?? '',
                text => setRule(prev => ({ ...prev, continuityRequirements: text || undefined })),
              )}
            />
          </div>
          <textarea className="input" rows={2} value={rule.continuityRequirements ?? ''}
            disabled={polishing === 'continuity'}
            onChange={e => setRule({ ...rule, continuityRequirements: e.target.value || undefined })} />
        </div>
        <div className="col-span-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!rule.mustGenerateOutlineFirst}
              onChange={e => setRule({ ...rule, mustGenerateOutlineFirst: e.target.checked })} />
            必须先生成章纲
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!rule.mustGenerateByScenes}
              onChange={e => setRule({ ...rule, mustGenerateByScenes: e.target.checked })} />
            按场景分段生成
          </label>
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>额外指令（会原样附加到 Prompt 末尾）</label>
            <PolishButton
              disabled={!rule.extraInstructions?.trim() || polishing !== null}
              loading={polishing === 'extra'}
              onClick={() => handlePolish(
                'extra', '额外指令',
                () => rule.extraInstructions ?? '',
                text => setRule(prev => ({ ...prev, extraInstructions: text || undefined })),
              )}
            />
          </div>
          <textarea className="input" rows={2} value={rule.extraInstructions ?? ''}
            disabled={polishing === 'extra'}
            onChange={e => setRule({ ...rule, extraInstructions: e.target.value || undefined })} />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存章节计划'}
        </button>
      </div>
    </div>
  );
}
