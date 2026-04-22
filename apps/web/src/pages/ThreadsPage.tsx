import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import type {
  NarrativeThread, ThreadConfidence, ThreadKind, ThreadStatus,
} from '../types';

const KIND_LABEL: Record<ThreadKind, string> = {
  foreshadow: '伏笔',
  subplot: '副线',
  promise: '承诺',
  mystery: '悬念',
};

const STATUS_LABEL: Record<ThreadStatus, string> = {
  active: '活跃',
  resolved: '已回收',
  abandoned: '已放弃',
};

const STATUS_COLOR: Record<ThreadStatus, string> = {
  active: 'bg-brand-600/20 text-brand-200',
  resolved: 'bg-emerald-900/50 text-emerald-200',
  abandoned: 'bg-ink-700 text-ink-400',
};

interface FormState {
  kind: ThreadKind;
  label: string;
  detail: string;
  introducedAtChapter: string;
  expectPayoffByChapter: string;
  resolvedAtChapter: string;
  status: ThreadStatus;
  confidence: ThreadConfidence;
  notes: string;
}

const emptyForm = (): FormState => ({
  kind: 'foreshadow', label: '', detail: '',
  introducedAtChapter: '', expectPayoffByChapter: '', resolvedAtChapter: '',
  status: 'active', confidence: 'high', notes: '',
});

export function ThreadsPage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<ThreadStatus | 'all'>('active');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NarrativeThread | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: threads = [] } = useQuery({
    queryKey: ['threads', novelId, filter === 'all' ? undefined : filter],
    queryFn: () => api.listThreads(novelId!, filter === 'all' ? undefined : filter),
    enabled: !!novelId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['threads', novelId] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Partial<NarrativeThread> = {
        kind: form.kind,
        label: form.label.trim(),
        detail: form.detail || null,
        introducedAtChapter: form.introducedAtChapter ? Number(form.introducedAtChapter) : null,
        expectPayoffByChapter: form.expectPayoffByChapter ? Number(form.expectPayoffByChapter) : null,
        resolvedAtChapter: form.resolvedAtChapter ? Number(form.resolvedAtChapter) : null,
        status: form.status,
        confidence: form.confidence,
        notes: form.notes || null,
      };
      if (editing) return api.updateThread(editing.id, payload);
      return api.createThread(novelId!, { ...payload, source: 'manual' });
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? '伏笔已更新' : '伏笔已新建');
      closeForm();
    },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteThread(id),
    onSuccess: () => { invalidate(); toast.success('已删除'); },
    onError: (e) => toast.error(`删除失败：${(e as Error).message}`),
  });

  const resolveMut = useMutation({
    mutationFn: (t: NarrativeThread) => api.updateThread(t.id, {
      status: 'resolved',
      resolvedAtChapter: t.resolvedAtChapter ?? null,
    }),
    onSuccess: () => { invalidate(); toast.success('已标记为回收'); },
  });

  const abandonMut = useMutation({
    mutationFn: (t: NarrativeThread) => api.updateThread(t.id, { status: 'abandoned' }),
    onSuccess: () => { invalidate(); toast.success('已标记为放弃'); },
  });

  const reactivateMut = useMutation({
    mutationFn: (t: NarrativeThread) => api.updateThread(t.id, { status: 'active', resolvedAtChapter: null }),
    onSuccess: () => { invalidate(); toast.success('已重新激活'); },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    saveMut.reset();
  };
  const startEdit = (t: NarrativeThread) => {
    setEditing(t);
    setForm({
      kind: t.kind,
      label: t.label,
      detail: t.detail ?? '',
      introducedAtChapter: t.introducedAtChapter != null ? String(t.introducedAtChapter) : '',
      expectPayoffByChapter: t.expectPayoffByChapter != null ? String(t.expectPayoffByChapter) : '',
      resolvedAtChapter: t.resolvedAtChapter != null ? String(t.resolvedAtChapter) : '',
      status: t.status,
      confidence: t.confidence,
      notes: t.notes ?? '',
    });
    setShowForm(true);
    saveMut.reset();
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); };

  const summary = useMemo(() => {
    const all = threads;
    return {
      active: all.filter(t => t.status === 'active').length,
      resolved: all.filter(t => t.status === 'resolved').length,
      abandoned: all.filter(t => t.status === 'abandoned').length,
    };
  }, [threads]);

  return (
    <div className="h-full overflow-auto scrollbar-thin p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">伏笔 / 线索台账</h1>
          <p className="text-sm text-ink-400 mt-1">
            记录已埋伏笔、预期回收章节，章节生成时自动注入；也支持你手工维护。
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ 手动新增</button>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm">
        {(['active', 'resolved', 'abandoned', 'all'] as const).map(s => (
          <button key={s}
            className={`px-3 py-1 rounded-md border transition-colors ${
              filter === s
                ? 'border-brand-500 bg-brand-500/10 text-brand-200'
                : 'border-ink-700 text-ink-300 hover:bg-ink-800'
            }`}
            onClick={() => setFilter(s)}>
            {s === 'all' ? '全部' : STATUS_LABEL[s]}
            {s !== 'all' && <span className="ml-1 text-xs text-ink-400">{summary[s]}</span>}
          </button>
        ))}
      </div>

      <div className={`grid gap-6 ${showForm ? 'grid-cols-[1fr_420px]' : 'grid-cols-1'}`}>
        <div>
          {threads.length === 0 ? (
            <div className="text-ink-500 text-sm">暂无数据。章节生成成功时会自动抽取，也可以手动新增。</div>
          ) : (
            <ul className="space-y-2">
              {threads.map(t => (
                <li key={t.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="tag">{KIND_LABEL[t.kind]}</span>
                        <span className={`tag ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                        {t.source === 'auto' && <span className="tag text-xs">自动</span>}
                        <span className="font-medium">{t.label}</span>
                      </div>
                      <div className="mt-1 text-xs text-ink-400">
                        {t.introducedAtChapter != null && <>第 {t.introducedAtChapter} 章埋下 </>}
                        {t.expectPayoffByChapter != null && <>· 预期第 {t.expectPayoffByChapter} 章回收 </>}
                        {t.resolvedAtChapter != null && <>· 实际第 {t.resolvedAtChapter} 章回收 </>}
                        · confidence：{t.confidence}
                      </div>
                      {t.detail && (
                        <div className="mt-2 text-sm text-ink-200 whitespace-pre-wrap">{t.detail}</div>
                      )}
                      {t.notes && (
                        <div className="mt-1 text-xs text-ink-500">备注：{t.notes}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {t.status === 'active' && (
                        <>
                          <button className="btn btn-ghost text-xs"
                            onClick={() => resolveMut.mutate(t)}>标记回收</button>
                          <button className="btn btn-ghost text-xs"
                            onClick={() => abandonMut.mutate(t)}>放弃</button>
                        </>
                      )}
                      {t.status !== 'active' && (
                        <button className="btn btn-ghost text-xs"
                          onClick={() => reactivateMut.mutate(t)}>重新激活</button>
                      )}
                      <button className="btn btn-ghost text-xs" onClick={() => startEdit(t)}>编辑</button>
                      <button className="btn btn-danger text-xs"
                        onClick={() => { if (confirm(`删除伏笔「${t.label}」？`)) deleteMut.mutate(t.id); }}>
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showForm && (
          <div className="card h-fit sticky top-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{editing ? '编辑伏笔' : '手动新增伏笔'}</h3>
              <button className="btn btn-ghost text-xs" onClick={closeForm}>关闭</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">类型</label>
                  <select className="input" value={form.kind}
                    onChange={e => setForm({ ...form, kind: e.target.value as ThreadKind })}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">状态</label>
                  <select className="input" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as ThreadStatus })}>
                    {Object.entries(STATUS_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">label（短标题，用于 LLM 匹配）</label>
                <input className="input" value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="例：师父旧仇" />
              </div>
              <div>
                <label className="label">详情</label>
                <textarea className="input" rows={4} value={form.detail}
                  onChange={e => setForm({ ...form, detail: e.target.value })}
                  placeholder="描述这条伏笔/悬念的具体内容、预期走向…" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">埋下（章）</label>
                  <input type="number" className="input" value={form.introducedAtChapter}
                    onChange={e => setForm({ ...form, introducedAtChapter: e.target.value })} />
                </div>
                <div>
                  <label className="label">预期回收（章）</label>
                  <input type="number" className="input" value={form.expectPayoffByChapter}
                    onChange={e => setForm({ ...form, expectPayoffByChapter: e.target.value })} />
                </div>
                <div>
                  <label className="label">实际回收（章）</label>
                  <input type="number" className="input" value={form.resolvedAtChapter}
                    onChange={e => setForm({ ...form, resolvedAtChapter: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">置信度</label>
                <select className="input" value={form.confidence}
                  onChange={e => setForm({ ...form, confidence: e.target.value as ThreadConfidence })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label className="label">备注</label>
                <textarea className="input" rows={2} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-ghost" onClick={closeForm}>取消</button>
                <button className="btn btn-primary"
                  disabled={!form.label.trim() || saveMut.isPending}
                  onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
