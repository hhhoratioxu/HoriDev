import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  FolderKanban,
  Clock3,
  CheckCheck,
  CircleAlert,
  Search,
  Code2,
  MoreHorizontal,
  Trash2,
  Terminal,
} from 'lucide-react';
import { Shell, Modal, Spinner, Empty, ErrorBox } from '../components/ui';
import { useAuth, useToast } from '../lib/context';
import { api, money, time } from '../lib/api';
import { type Project, type Task, statusLabels, serviceOptions } from '../../shared/contracts';

export function NewProject({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { config } = useAuth();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('prompt'),
          service: data.get('service'),
        }),
      });
      const task = await api<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, prompt: data.get('prompt') }),
      });
      navigate(`/workspace/${project.id}/${task.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="开始一个新想法" onClose={onClose}>
      <p className="subtle">先描述目标，我们会在工作区一起确认实现方向。</p>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          项目名称
          <input name="name" placeholder="例如：Excel 日期分类助手" required maxLength={80} />
        </label>
        <label>
          开发服务
          <select name="service">
            {serviceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          你想实现什么？
          <textarea
            name="prompt"
            placeholder="我需要一个 Python 工具，把 Excel 表格按照日期分类。日期列名是「日期」，希望按月导出…"
            required
            minLength={10}
            maxLength={12000}
            rows={5}
          />
        </label>
        <div className="notice">
          <Sparkles size={16} />
          <span>
            {config?.mode === 'demo'
              ? '当前为演示模式：会使用预置 Excel 示例，不会调用 OpenAI。'
              : '当前为 Live 模式：真实分析前需要管理员确认资源授权。'}
          </span>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? '正在创建…' : '创建项目，进入工作区'}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
export function Dashboard({ projectsOnly = false }: { projectsOnly?: boolean }) {
  const { me, config, refresh } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const closeNew = useCallback(() => setShowNew(false), []);
  const load = useCallback(async () => {
    setError('');
    try {
      const [p, t] = await Promise.all([api<Project[]>('/projects'), api<Task[]>('/tasks')]);
      setProjects(p);
      setTasks(t);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void load();
  }, [load]);
  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/projects/${deleting.id}`, { method: 'DELETE', body: '{}' });
      setDeleting(null);
      toast('项目已删除。');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
      setDeleting(null);
    }
  };
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const active = tasks.filter((t) =>
    ['analyzing', 'generating', 'reviewing'].includes(t.status),
  ).length;
  const used = (me?.usage.costMicros ?? 0) + (me?.usage.reservedMicros ?? 0);
  const quota = me?.limitMicros ?? 1;
  return (
    <Shell>
      <main className="dashboard page-container">
        <div className="page-title-row">
          <div>
            <span className="eyebrow">YOUR CREATIVE SPACE</span>
            <h1>{projectsOnly ? '每个想法，都在这里。' : `你好，${me?.user.name}。`}</h1>
            <p>{projectsOnly ? '查看、继续和管理你的开发项目。' : '今天，创造点什么？'}</p>
          </div>
          <button className="button primary" onClick={() => setShowNew(true)}>
            <Plus size={17} /> 新建项目
          </button>
        </div>
        {!projectsOnly && (
          <>
            <section className="create-banner glass">
              <div className="banner-orb" />
              <div>
                <span className="tiny-tag">
                  <Sparkles size={12} /> MAKE SOMETHING NEW
                </span>
                <h2>
                  想法不必等待。
                  <br />
                  你的下一件作品，现在开始。
                </h2>
                <p>描述需求，确认方向，带走完整源码。</p>
                <button className="button dark" onClick={() => setShowNew(true)}>
                  开始创造 <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="banner-visual" aria-hidden="true">
                <div className="glass-code-tag">&lt; / &gt;</div>
                <span className="tag-float">hello, possibilities.</span>
                <span className="tag-float second">idea → reality</span>
              </div>
            </section>
            <div className="stats-grid">
              {[
                {
                  label: '开发项目',
                  value: projects.length,
                  icon: FolderKanban,
                  detail: '你的创造集合',
                },
                {
                  label: '开发任务',
                  value: tasks.length,
                  icon: Code2,
                  detail: `${active} 个正在处理`,
                },
                {
                  label: '已交付任务',
                  value: completed,
                  icon: CheckCheck,
                  detail: '源码与静态审查完成',
                },
                {
                  label: 'API 用量',
                  value: money(me?.usage.costMicros ?? 0),
                  icon: Sparkles,
                  detail:
                    config?.mode === 'demo'
                      ? '演示不会消耗 Token'
                      : `${(me?.usage.inputTokens ?? 0) + (me?.usage.outputTokens ?? 0)} Tokens`,
                },
              ].map((stat) => (
                <article className="stat-card glass" key={stat.label}>
                  <span>
                    {stat.label}
                    <stat.icon size={18} />
                  </span>
                  <strong>{stat.value}</strong>
                  <small>{stat.detail}</small>
                </article>
              ))}
            </div>
          </>
        )}
        {error ? (
          <ErrorBox message={error} retry={() => void load()} />
        ) : loading ? (
          <Spinner />
        ) : (
          <>
            <section className="projects-section">
              <div className="section-heading">
                <h2>
                  {projectsOnly ? '我的项目' : '近期项目'}
                  <span>{projects.length}</span>
                </h2>
                <label className="search-input">
                  <Search size={15} />
                  <input
                    aria-label="搜索项目"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索项目…"
                  />
                </label>
              </div>
              {projects.length === 0 ? (
                <Empty
                  icon={<FolderKanban size={32} />}
                  title="好作品，从第一个项目开始。"
                  description="这里将保存你的需求、文件和每一次迭代。"
                  action={
                    <button className="button secondary" onClick={() => setShowNew(true)}>
                      <Plus size={16} /> 创建第一个项目
                    </button>
                  }
                />
              ) : (
                <div className="project-grid">
                  {projects
                    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                    .map((p, i) => {
                      const recent = tasks.find((t) => t.projectId === p.id);
                      return (
                        <article className="project-card glass" key={p.id}>
                          <div className="project-card-top">
                            <Link
                              to={`/workspace/${p.id}${recent ? `/${recent.id}` : ''}`}
                              className={`project-icon tone-${i % 6}`}
                            >
                              <Terminal size={22} />
                            </Link>
                            <div className="project-menu">
                              <button
                                className="icon-button"
                                onClick={() => setMenu(menu === p.id ? null : p.id)}
                                aria-label={`管理 ${p.name}`}
                              >
                                <MoreHorizontal size={19} />
                              </button>
                              {menu === p.id && (
                                <button
                                  className="delete-menu"
                                  onClick={() => {
                                    setDeleting(p);
                                    setMenu(null);
                                  }}
                                >
                                  <Trash2 size={14} /> 删除项目
                                </button>
                              )}
                            </div>
                          </div>
                          <Link
                            className="project-name"
                            to={`/workspace/${p.id}${recent ? `/${recent.id}` : ''}`}
                          >
                            {p.name}
                            <ArrowUpRight size={16} />
                          </Link>
                          <p>{p.description}</p>
                          <footer>
                            <span className={`status-badge ${recent?.status ?? 'draft'}`}>
                              {recent ? statusLabels[recent.status] : '暂无任务'}
                            </span>
                            <small>{time(p.updatedAt)}</small>
                          </footer>
                        </article>
                      );
                    })}
                </div>
              )}
            </section>
            {!projectsOnly && (
              <div className="dashboard-lower">
                <section className="task-list-panel glass">
                  <div className="section-heading">
                    <h2>任务动态</h2>
                    <Clock3 size={17} />
                  </div>
                  {tasks.length === 0 ? (
                    <p className="empty-inline">新的创造，会从这里留下足迹。</p>
                  ) : (
                    tasks.slice(0, 5).map((t) => (
                      <Link
                        className="task-list-item"
                        key={t.id}
                        to={`/workspace/${t.projectId}/${t.id}`}
                      >
                        <span className={`task-symbol ${t.status}`}>
                          <Code2 size={17} />
                        </span>
                        <div>
                          <b>{t.title}</b>
                          <small>
                            {time(t.updatedAt)} · {t.mode === 'demo' ? '演示任务' : '真实任务'}
                          </small>
                        </div>
                        <span className={`status-badge ${t.status}`}>{statusLabels[t.status]}</span>
                        <ArrowUpRight size={14} />
                      </Link>
                    ))
                  )}
                </section>
                <aside className="quota-panel glass">
                  <div className="section-heading">
                    <h2>你的 AI 额度</h2>
                    <Sparkles size={17} />
                  </div>
                  <strong>
                    {money(used)}
                    <small> / {money(quota)}</small>
                  </strong>
                  <div className="progress-track">
                    <i style={{ width: `${Math.min(100, (used / quota) * 100)}%` }} />
                  </div>
                  <p>
                    包含已结算估算与未确认预留。
                    <br />
                    此额度为平台内部控制。
                  </p>
                  {(me?.usage.reservedMicros ?? 0) > 0 && (
                    <p className="warning-text">待确认预留 {money(me!.usage.reservedMicros)}</p>
                  )}
                  <div className="quota-foot">
                    <CircleAlert size={14} />
                    {config?.mode === 'demo'
                      ? '演示消耗为零，非真实 API 用量。'
                      : '最终费用以 OpenAI 账单为准。'}
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>
      {showNew && <NewProject onClose={closeNew} />}{' '}
      {deleting && (
        <Modal title="删除这个项目？" onClose={() => setDeleting(null)}>
          <p>将删除「{deleting.name}」的全部任务和文件，此操作无法恢复。请先导出需要保留的源码。</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDeleting(null)}>
              保留项目
            </button>
            <button className="button danger" onClick={() => void remove()}>
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
