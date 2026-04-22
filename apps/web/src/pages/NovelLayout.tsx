import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

const NAV = [
  { to: '', label: '概览', end: true },
  { to: 'settings', label: '设定中心' },
  { to: 'outline', label: '大纲中心' },
  { to: 'plans', label: '章节计划' },
  { to: 'threads', label: '伏笔台账' },
  { to: 'characters', label: '角色状态' },
  { to: 'arcs', label: '卷/弧摘要' },
  { to: 'reviews', label: '审核中心' },
];

export function NovelLayout() {
  const { novelId } = useParams();
  const { data: novel } = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => api.getNovel(novelId!),
    enabled: !!novelId,
  });

  return (
    <div className="h-full flex">
      <aside className="w-56 shrink-0 border-r border-ink-700 bg-ink-900 flex flex-col">
        <div className="p-4 border-b border-ink-700">
          <div className="text-xs text-ink-400">当前小说</div>
          <div className="mt-1 font-semibold truncate">{novel?.title ?? '…'}</div>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm transition-colors ${
                  isActive ? 'bg-ink-800 text-brand-500 border-l-2 border-brand-500' : 'text-ink-300 hover:bg-ink-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto scrollbar-thin">
        <Outlet />
      </main>
    </div>
  );
}
