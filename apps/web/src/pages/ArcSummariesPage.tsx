import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import type { ArcSummary } from '../types';

export function ArcSummariesPage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: arcs = [] } = useQuery({
    queryKey: ['arcs', novelId],
    queryFn: () => api.listArcSummaries(novelId!),
    enabled: !!novelId,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', novelId],
    queryFn: () => api.listPlans(novelId!),
    enabled: !!novelId,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ArcSummary | null>(null);
  const [editForm, setEditForm] = useState({ title: '', brief: '', keyThreadsText: '', notes: '' });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['arcs', novelId] });

  const createMut = useMutation({
    mutationFn: () => api.createArcSummary(novelId!, {
      title: title.trim(),
      chapterPlanIds: Object.keys(selected).filter(id => selected[id]),
      notes: notes || null,
    }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setTitle(''); setNotes(''); setSelected({});
      toast.success('卷/弧摘要已生成');
    },
    onError: (e) => toast.error(`生成失败：${(e as Error).message}`),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => api.updateArcSummary(id, {
      title: editForm.title,
      brief: editForm.brief,
      keyThreads: editForm.keyThreadsText.split('\n').map(s => s.trim()).filter(Boolean),
      notes: editForm.notes || null,
    }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('已更新');
    },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteArcSummary(id),
    onSuccess: () => { invalidate(); toast.success('已删除'); },
  });

  const selectedRange = useMemo(() => {
    const ids = Object.keys(selected).filter(id => selected[id]);
    const nums = ids.map(id => plans.find(p => p.id === id)?.chapterNumber).filter((x): x is number => x != null);
    if (!nums.length) return '';
    nums.sort((a, b) => a - b);
    return `第 ${nums[0]}-${nums[nums.length - 1]} 章，共 ${nums.length} 章`;
  }, [selected, plans]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const startEdit = (arc: ArcSummary) => {
    setEditing(arc);
    setEditForm({
      title: arc.title,
      brief: arc.brief,
      keyThreadsText: (arc.keyThreads ?? []).join('\n'),
      notes: arc.notes ?? '',
    });
  };

  return (
    <div className="h-full overflow-auto scrollbar-thin p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">卷 / 弧摘要</h1>
          <p className="text-sm text-ink-400 mt-1">
            选一批已有单章摘要的章节，二次归纳成 300–600 字的"卷/弧 brief"。
            后续章节生成时会自动把覆盖的早期章节换成这条摘要，节省 token 的同时保留长程记忆。
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? '收起' : '+ 生成新的卷/弧摘要'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">弧/卷名称</label>
              <input className="input" value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="第一卷·引路人 / 青云山篇 …" />
            </div>
            <div>
              <label className="label">已选</label>
              <div className="input text-ink-300 bg-ink-900/40">{selectedCount ? selectedRange : '（未选）'}</div>
            </div>
            <div className="col-span-2">
              <label className="label">备注（可选）</label>
              <textarea className="input" rows={2} value={notes}
                onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-ink-300">勾选要归纳的章节（需要这些章节已有单章摘要）：</div>
              <div className="flex gap-2 text-xs">
                <button className="btn btn-ghost text-xs"
                  onClick={() => setSelected(Object.fromEntries(plans.map(p => [p.id, true])))}>
                  全选
                </button>
                <button className="btn btn-ghost text-xs" onClick={() => setSelected({})}>清空</button>
              </div>
            </div>
            <div className="max-h-64 overflow-auto scrollbar-thin border border-ink-700 rounded p-2 bg-ink-900/40">
              {plans.length === 0 ? (
                <div className="text-ink-500 text-sm p-2">还没有章节计划。</div>
              ) : (
                <ul className="grid grid-cols-2 gap-1">
                  {plans.map(p => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-ink-800 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!selected[p.id]}
                          onChange={e => setSelected(s => ({ ...s, [p.id]: e.target.checked }))} />
                        <span className="text-ink-400 w-12 text-right">第{p.chapterNumber}章</span>
                        <span className="truncate">{p.title || '（无标题）'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            {(() => {
              const missing: string[] = [];
              if (!title.trim()) missing.push('填写"弧/卷名称"');
              if (selectedCount === 0) missing.push('至少勾选一章');
              return missing.length > 0 ? (
                <span className="text-xs text-ink-500">需要：{missing.join('、')}</span>
              ) : null;
            })()}
            <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setSelected({}); }}>取消</button>
            <button className="btn btn-primary"
              disabled={!title.trim() || selectedCount === 0 || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? '归纳中…（可能需要数十秒）' : '生成'}
            </button>
          </div>
          {createMut.isError && (
            <div className="mt-2 text-xs text-red-400">{(createMut.error as Error)?.message}</div>
          )}
        </div>
      )}

      {arcs.length === 0 ? (
        <div className="text-ink-500 text-sm">还没有任何卷/弧摘要。</div>
      ) : (
        <ul className="space-y-3">
          {arcs.map(arc => (
            <li key={arc.id} className="card">
              {editing?.id === arc.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="label">标题</label>
                    <input className="input" value={editForm.title}
                      onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">brief</label>
                    <textarea className="input" rows={6} value={editForm.brief}
                      onChange={e => setEditForm({ ...editForm, brief: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">key threads（每行一条）</label>
                    <textarea className="input" rows={4} value={editForm.keyThreadsText}
                      onChange={e => setEditForm({ ...editForm, keyThreadsText: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">备注</label>
                    <textarea className="input" rows={2} value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
                    <button className="btn btn-primary"
                      disabled={updateMut.isPending}
                      onClick={() => updateMut.mutate(arc.id)}>
                      {updateMut.isPending ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{arc.title}</span>
                      {arc.fromChapter != null && arc.toChapter != null && (
                        <span className="tag">第 {arc.fromChapter}–{arc.toChapter} 章</span>
                      )}
                      <span className="tag">{arc.chapterPlanIds.length} 章</span>
                    </div>
                    <div className="mt-2 text-sm leading-6 whitespace-pre-wrap">{arc.brief}</div>
                    {arc.keyThreads?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-ink-400 mb-1">key threads</div>
                        <ul className="space-y-1 text-sm list-disc list-inside text-ink-200">
                          {arc.keyThreads.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    )}
                    {arc.notes && (
                      <div className="mt-2 text-xs text-ink-500">备注：{arc.notes}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button className="btn btn-ghost text-xs" onClick={() => startEdit(arc)}>编辑</button>
                    <button className="btn btn-danger text-xs"
                      onClick={() => { if (confirm(`删除「${arc.title}」？`)) deleteMut.mutate(arc.id); }}>
                      删除
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
