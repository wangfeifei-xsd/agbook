import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import type { CharacterState } from '../types';

interface FormState {
  name: string;
  location: string;
  condition: string;
  relationsText: string;   // 每行 "target:relation"
  possessionsText: string; // 逗号或换行分隔
  flagsText: string;
  lastUpdatedAtChapter: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  name: '', location: '', condition: '',
  relationsText: '', possessionsText: '', flagsText: '',
  lastUpdatedAtChapter: '', notes: '',
});

function splitLines(s: string): string[] {
  return s.split(/[\n,，]/).map(x => x.trim()).filter(Boolean);
}

function parseRelations(s: string): { target: string; relation: string }[] {
  return s.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const idx = line.search(/[:：]/);
    if (idx <= 0) return { target: line, relation: '' };
    return { target: line.slice(0, idx).trim(), relation: line.slice(idx + 1).trim() };
  }).filter(r => r.target);
}

function formatRelations(list: { target: string; relation: string }[]): string {
  return list.map(r => `${r.target}：${r.relation}`).join('\n');
}

export function CharacterStatesPage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CharacterState | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: states = [] } = useQuery({
    queryKey: ['characters', novelId],
    queryFn: () => api.listCharacterStates(novelId!),
    enabled: !!novelId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['characters', novelId] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Partial<CharacterState> = {
        name: form.name.trim(),
        location: form.location || null,
        condition: form.condition || null,
        relations: parseRelations(form.relationsText),
        possessions: splitLines(form.possessionsText),
        notableFlags: splitLines(form.flagsText),
        lastUpdatedAtChapter: form.lastUpdatedAtChapter ? Number(form.lastUpdatedAtChapter) : null,
        notes: form.notes || null,
      };
      if (editing) return api.updateCharacterState(editing.id, payload);
      return api.upsertCharacterState(novelId!, payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? '已更新' : '已新建');
      closeForm();
    },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCharacterState(id),
    onSuccess: () => { invalidate(); toast.success('已删除'); },
    onError: (e) => toast.error(`删除失败：${(e as Error).message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    saveMut.reset();
  };
  const startEdit = (c: CharacterState) => {
    setEditing(c);
    setForm({
      name: c.name,
      location: c.location ?? '',
      condition: c.condition ?? '',
      relationsText: formatRelations(c.relations ?? []),
      possessionsText: (c.possessions ?? []).join('\n'),
      flagsText: (c.notableFlags ?? []).join('\n'),
      lastUpdatedAtChapter: c.lastUpdatedAtChapter != null ? String(c.lastUpdatedAtChapter) : '',
      notes: c.notes ?? '',
    });
    setShowForm(true);
    saveMut.reset();
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); };

  return (
    <div className="h-full overflow-auto scrollbar-thin p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">角色状态快照</h1>
          <p className="text-sm text-ink-400 mt-1">
            每次章节生成后自动更新：位置、当前状态、关系、持有物、显著标签。
            生成下一章时自动把相关角色的当前状态注入上下文。
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ 手动新增</button>
      </div>

      <div className={`grid gap-6 ${showForm ? 'grid-cols-[1fr_420px]' : 'grid-cols-1'}`}>
        <div>
          {states.length === 0 ? (
            <div className="text-ink-500 text-sm">暂无角色状态。生成章节后会自动抽取。</div>
          ) : (
            <ul className="space-y-2">
              {states.map(c => (
                <li key={c.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-base">{c.name}</span>
                        {c.lastUpdatedAtChapter != null && (
                          <span className="tag">第 {c.lastUpdatedAtChapter} 章更新</span>
                        )}
                        {c.notableFlags?.slice(0, 4).map(f => (
                          <span key={f} className="tag bg-brand-600/20 text-brand-200">{f}</span>
                        ))}
                      </div>
                      <div className="mt-2 text-sm grid grid-cols-2 gap-x-6 gap-y-1">
                        {c.location && <div><span className="text-ink-500">位置：</span>{c.location}</div>}
                        {c.condition && <div><span className="text-ink-500">状态：</span>{c.condition}</div>}
                        {c.possessions?.length ? (
                          <div className="col-span-2"><span className="text-ink-500">持有：</span>{c.possessions.join('、')}</div>
                        ) : null}
                        {c.relations?.length ? (
                          <div className="col-span-2">
                            <span className="text-ink-500">关系：</span>
                            {c.relations.map((r, i) => (
                              <span key={i} className="mr-2">{r.target}（{r.relation}）</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {c.notes && (
                        <div className="mt-2 text-xs text-ink-500">备注：{c.notes}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button className="btn btn-ghost text-xs" onClick={() => startEdit(c)}>编辑</button>
                      <button className="btn btn-danger text-xs"
                        onClick={() => { if (confirm(`删除角色状态「${c.name}」？`)) deleteMut.mutate(c.id); }}>
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
              <h3 className="font-semibold">{editing ? '编辑角色状态' : '新增角色状态'}</h3>
              <button className="btn btn-ghost text-xs" onClick={closeForm}>关闭</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">角色姓名（需与正文中一致）</label>
                <input className="input" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">位置</label>
                  <input className="input" value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="label">状态</label>
                  <input className="input" value={form.condition}
                    onChange={e => setForm({ ...form, condition: e.target.value })}
                    placeholder="重伤 / 封印 / 晋升 …" />
                </div>
              </div>
              <div>
                <label className="label">关系（每行一条，格式 "对象：关系"）</label>
                <textarea className="input" rows={4} value={form.relationsText}
                  onChange={e => setForm({ ...form, relationsText: e.target.value })}
                  placeholder="李青云：师父&#10;赵芸：夙敌，互有承诺" />
              </div>
              <div>
                <label className="label">持有物（逗号或换行分隔）</label>
                <textarea className="input" rows={2} value={form.possessionsText}
                  onChange={e => setForm({ ...form, possessionsText: e.target.value })}
                  placeholder="断玉剑, 残卷上篇" />
              </div>
              <div>
                <label className="label">显著标签（逗号或换行）</label>
                <textarea className="input" rows={2} value={form.flagsText}
                  onChange={e => setForm({ ...form, flagsText: e.target.value })}
                  placeholder="受伤, 黑化, 晋升" />
              </div>
              <div>
                <label className="label">上次更新于（章节号）</label>
                <input type="number" className="input" value={form.lastUpdatedAtChapter}
                  onChange={e => setForm({ ...form, lastUpdatedAtChapter: e.target.value })} />
              </div>
              <div>
                <label className="label">备注</label>
                <textarea className="input" rows={2} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-ghost" onClick={closeForm}>取消</button>
                <button className="btn btn-primary"
                  disabled={!form.name.trim() || saveMut.isPending}
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
