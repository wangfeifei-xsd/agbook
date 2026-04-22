import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import type { ModelProvider, ProviderPurpose } from '../types';

const PURPOSE_LABEL: Record<ProviderPurpose, string> = {
  generation: '正文生成',
  summarizer: '摘要 / 记忆',
};

export function ProvidersPage() {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: api.listProviders,
  });

  const [editing, setEditing] = useState<ModelProvider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = () => ({
    name: '', baseUrl: 'https://api.openai.com', apiKey: '', model: 'gpt-4o-mini',
    headersText: '', isDefault: false, isSummarizerDefault: false,
    purpose: 'generation' as ProviderPurpose,
  });
  const [form, setForm] = useState(emptyForm());

  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    saveMut.reset();
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      let headers: Record<string, string> | undefined;
      if (form.headersText.trim()) {
        try { headers = JSON.parse(form.headersText); } catch { throw new Error('headers 必须为 JSON 对象'); }
      }
      const payload = {
        name: form.name, baseUrl: form.baseUrl, apiKey: form.apiKey, model: form.model,
        headers,
        isDefault: form.purpose === 'generation' ? form.isDefault : false,
        isSummarizerDefault: form.purpose === 'summarizer' ? form.isSummarizerDefault : false,
        purpose: form.purpose,
      };
      if (editing) return api.updateProvider(editing.id, payload);
      return api.createProvider(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteProvider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => api.testProvider(id),
    onSuccess: (res, id) => setTestResult(s => ({ ...s, [id]: res })),
    onError: (e, id) => setTestResult(s => ({ ...s, [id]: { ok: false, message: (e as Error).message } })),
  });

  const startEdit = (p: ModelProvider) => {
    setEditing(p);
    setForm({
      name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey ?? '', model: p.model,
      headersText: p.headers && Object.keys(p.headers).length ? JSON.stringify(p.headers, null, 2) : '',
      isDefault: p.isDefault,
      isSummarizerDefault: p.isSummarizerDefault,
      purpose: p.purpose ?? 'generation',
    });
    setShowForm(true);
    saveMut.reset();
  };

  return (
    <div className="h-full overflow-auto scrollbar-thin p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">模型配置</h1>
      <p className="text-sm text-ink-400 mb-6">
        兼容 OpenAI 风格 <code className="text-ink-200">/v1/chat/completions</code> 的模型服务。
        可配置多个 Provider，指定一个为默认。
      </p>

      <div className={`grid gap-6 ${showForm ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">已配置</h3>
            <button className="btn btn-primary text-xs" onClick={openCreate}>
              + 新建 Provider
            </button>
          </div>
          {providers.length === 0 ? (
            <div className="text-ink-500">还没有 Provider，点右上角新建一个吧。</div>
          ) : (
            <ul className="space-y-2">
              {providers.map(p => (
                <li key={p.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>{p.name}</span>
                        <span className="tag">{PURPOSE_LABEL[p.purpose ?? 'generation']}</span>
                        {p.isDefault && <span className="tag bg-brand-600/30 text-brand-200">生成默认</span>}
                        {p.isSummarizerDefault && (
                          <span className="tag bg-emerald-900/50 text-emerald-200">摘要默认</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-400 mt-1">{p.baseUrl} · {p.model}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost text-xs"
                        disabled={testMut.isPending && testMut.variables === p.id}
                        onClick={() => testMut.mutate(p.id)}>测试</button>
                      <button className="btn btn-ghost text-xs" onClick={() => startEdit(p)}>编辑</button>
                      <button className="btn btn-danger text-xs"
                        onClick={() => { if (confirm(`删除 Provider「${p.name}」？`)) deleteMut.mutate(p.id); }}>
                        删除
                      </button>
                    </div>
                  </div>
                  {testResult[p.id] && (
                    <div className={`mt-2 text-xs ${testResult[p.id].ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult[p.id].ok ? '连通 · ' : '失败 · '}{testResult[p.id].message}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {showForm && (
        <div className="card">
          <h3 className="font-semibold mb-3">{editing ? '编辑' : '新建'} Provider</h3>
          <div className="space-y-3">
            <div>
              <label className="label">名称</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="OpenAI / DeepSeek / 通义千问 …" />
            </div>
            <div>
              <label className="label">Base URL</label>
              <input className="input" value={form.baseUrl}
                onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.openai.com（末尾可不带 /v1，会自动补）" />
            </div>
            <div>
              <label className="label">API Key</label>
              <input type="password" className="input" value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
            </div>
            <div>
              <label className="label">Model</label>
              <input className="input" value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="gpt-4o-mini / deepseek-chat / qwen-plus …" />
            </div>
            <div>
              <label className="label">自定义 Headers（JSON，可选）</label>
              <textarea className="input font-mono text-xs" rows={3} value={form.headersText}
                onChange={e => setForm({ ...form, headersText: e.target.value })}
                placeholder='{"X-Extra": "value"}' />
            </div>
            <div>
              <label className="label">用途</label>
              <select className="input" value={form.purpose}
                onChange={e => setForm({ ...form, purpose: e.target.value as ProviderPurpose })}>
                <option value="generation">正文生成（主力模型）</option>
                <option value="summarizer">摘要 / 记忆（可用便宜模型）</option>
              </select>
              <div className="mt-1 text-xs text-ink-500">
                建议为「摘要/记忆」单独挂一个便宜的小模型（如 gpt-4o-mini / qwen-plus），成本能压到生成的 1/10。
              </div>
            </div>
            {form.purpose === 'generation' ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isDefault}
                  onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
                设为正文生成默认
              </label>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isSummarizerDefault}
                  onChange={e => setForm({ ...form, isSummarizerDefault: e.target.checked })} />
                设为摘要/记忆默认
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-ghost" onClick={closeForm}>取消</button>
              <button className="btn btn-primary"
                disabled={!form.name.trim() || !form.baseUrl.trim() || !form.model.trim() || saveMut.isPending}
                onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? '保存中…' : '保存'}
              </button>
            </div>
            {saveMut.isError && (
              <div className="text-xs text-red-400">{(saveMut.error as Error).message}</div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
