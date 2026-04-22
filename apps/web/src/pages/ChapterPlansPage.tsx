import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import type { ChapterPlan, ChapterRuleSet } from '../types';

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
            onDelete={() => { if (confirm('删除该章节计划？')) deleteMut.mutate(selected.id); }}
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
          <label className="label">标题</label>
          <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">章节摘要</label>
          <textarea className="input" rows={3} value={form.summary}
            onChange={e => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">本章目标 / 必须发生</label>
          <textarea className="input" rows={2} value={form.goal}
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
          <label className="label">必须出现的情节点（每行一条）</label>
          <textarea className="input" rows={3} value={mustIncludeText}
            onChange={e => setMustIncludeText(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">禁止出现的内容（每行一条）</label>
          <textarea className="input" rows={3} value={mustAvoidText}
            onChange={e => setMustAvoidText(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">连续性要求（需承接的信息）</label>
          <textarea className="input" rows={2} value={rule.continuityRequirements ?? ''}
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
          <label className="label">额外指令（会原样附加到 Prompt 末尾）</label>
          <textarea className="input" rows={2} value={rule.extraInstructions ?? ''}
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
