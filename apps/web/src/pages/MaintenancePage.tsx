import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';

const TABLE_LABELS: Record<string, string> = {
  novels: '小说',
  setting_items: '设定项',
  outline_nodes: '大纲节点',
  chapter_plans: '章节计划',
  chapter_drafts: '章节草稿',
  draft_versions: '草稿版本',
  review_reports: '审核报告',
  model_providers: '模型配置',
  chapter_summaries: '章节摘要',
  arc_summaries: '弧光摘要',
  narrative_threads: '叙事伏笔',
  character_states: '角色状态',
};

const BLOATY_TABLES = new Set([
  'draft_versions',
  'review_reports',
  'chapter_summaries',
]);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function MaintenancePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [versionKeep, setVersionKeep] = useState(5);
  const [reviewKeep, setReviewKeep] = useState(3);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: api.maintenanceStats,
  });

  const pruneVersionsMut = useMutation({
    mutationFn: (keep: number) => api.maintenancePruneDraftVersions(keep),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] });
      toast.success(`已清理 ${res.removed} 个历史版本（覆盖 ${res.drafts} 份草稿）`);
    },
    onError: (e) => toast.error(`清理失败：${(e as Error).message}`),
  });

  const pruneReviewsMut = useMutation({
    mutationFn: (keep: number) => api.maintenancePruneReviews(keep),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] });
      toast.success(`已清理 ${res.removed} 条审核记录（覆盖 ${res.plans} 章）`);
    },
    onError: (e) => toast.error(`清理失败：${(e as Error).message}`),
  });

  const vacuumMut = useMutation({
    mutationFn: () => api.maintenanceVacuum(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] });
      toast.success(`VACUUM 完成，当前体积 ${formatBytes(res.stats.dbSizeBytes)}`);
    },
    onError: (e) => toast.error(`VACUUM 失败：${(e as Error).message}`),
  });

  const totalRows = stats ? Object.values(stats.tables).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="h-full overflow-auto scrollbar-thin p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">数据库维护</h1>
      <p className="text-sm text-ink-400 mb-6">
        查看本地 SQLite 数据库各表规模，清理累积的草稿历史版本、审核报告等冗余数据。
        所有操作都是物理删除，请先确认不再需要相关记录。
      </p>

      {isLoading || !stats ? (
        <div className="text-ink-400">加载中…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="card">
              <div className="text-xs text-ink-400">数据库文件大小</div>
              <div className="text-xl font-semibold mt-1">{formatBytes(stats.dbSizeBytes)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-ink-400">草稿正文占用（sum of LENGTH）</div>
              <div className="text-xl font-semibold mt-1">{formatBytes(stats.draftVersionBytes)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-ink-400">总行数</div>
              <div className="text-xl font-semibold mt-1">{totalRows.toLocaleString()}</div>
            </div>
          </div>

          <div className="card mb-6">
            <h3 className="font-semibold mb-2">各表行数</h3>
            <table className="w-full text-sm">
              <thead className="text-ink-400">
                <tr className="border-b border-ink-700">
                  <th className="text-left py-2">表</th>
                  <th className="text-left py-2">说明</th>
                  <th className="text-right py-2">行数</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.tables)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <tr key={name} className="border-b border-ink-800">
                      <td className="py-2 font-mono text-xs text-ink-200">
                        {name}
                        {BLOATY_TABLES.has(name) && count > 50 && (
                          <span className="ml-2 tag bg-yellow-900/60 text-yellow-200">易膨胀</span>
                        )}
                      </td>
                      <td className="py-2 text-ink-400 text-xs">{TABLE_LABELS[name] ?? '—'}</td>
                      <td className="py-2 text-right font-mono">{count.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="card mb-4">
            <h3 className="font-semibold mb-1">清理草稿历史版本</h3>
            <p className="text-xs text-ink-400 mb-3">
              每次「生成本章」或「保存手动修改」都会新增一个版本，版本中保存完整正文。章节多了后这里是最大的体积来源。
              当前显示版本（currentVersionId）始终保留。
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-ink-300">每章保留最近</label>
              <input type="number" min={1} max={50} className="input w-20"
                value={versionKeep}
                onChange={e => setVersionKeep(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
              <span className="text-sm text-ink-300">个版本</span>
              <button className="btn btn-danger ml-auto"
                disabled={pruneVersionsMut.isPending}
                onClick={() => {
                  if (confirm(`将清理所有章节的草稿历史，仅保留每章最近 ${versionKeep} 个版本（当前显示版本始终保留）。确认执行？`)) {
                    pruneVersionsMut.mutate(versionKeep);
                  }
                }}>
                {pruneVersionsMut.isPending ? '清理中…' : '执行清理'}
              </button>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="font-semibold mb-1">清理审核历史报告</h3>
            <p className="text-xs text-ink-400 mb-3">
              每次自动审核都会新增一条报告（含详细问题列表）。这些是纯历史记录，不影响业务流程。
              填 0 可清空全部历史。
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-ink-300">每章保留最近</label>
              <input type="number" min={0} max={50} className="input w-20"
                value={reviewKeep}
                onChange={e => setReviewKeep(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
              <span className="text-sm text-ink-300">条报告</span>
              <button className="btn btn-danger ml-auto"
                disabled={pruneReviewsMut.isPending}
                onClick={() => {
                  const msg = reviewKeep === 0
                    ? '将清空所有章节的审核历史报告。确认？'
                    : `每章保留最近 ${reviewKeep} 条审核报告，删除其余。确认执行？`;
                  if (confirm(msg)) pruneReviewsMut.mutate(reviewKeep);
                }}>
                {pruneReviewsMut.isPending ? '清理中…' : '执行清理'}
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-1">整理数据库（VACUUM）</h3>
            <p className="text-xs text-ink-400 mb-3">
              SQLite 删除数据后不会立即回收磁盘空间，运行 VACUUM 会重建文件以释放空间。
              执行期间 SQLite 会短暂上锁，建议在清理完历史后触发。
            </p>
            <button className="btn btn-primary"
              disabled={vacuumMut.isPending}
              onClick={() => vacuumMut.mutate()}>
              {vacuumMut.isPending ? 'VACUUM 中…' : '执行 VACUUM'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
