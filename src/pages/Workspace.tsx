import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowUp,
  ChevronDown,
  FileCode2,
  FolderOpen,
  Plus,
  Sparkles,
  Download,
  Save,
  GitCompareArrows,
  Code2,
  Eye,
  X,
  LoaderCircle,
  Square,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  Check,
  Clock3,
  History,
  Pencil,
  RefreshCw,
  Upload,
  MessageSquare,
  ListTree,
} from 'lucide-react';
import { Shell, Spinner, Empty, ErrorBox, Modal } from '../components/ui';
import { useAuth, useToast } from '../lib/context';
import { api, download, money, runStream, time } from '../lib/api';
import {
  type Project,
  type Task,
  type TaskDetail,
  type GeneratedFile,
  type Stage,
  statusLabels,
} from '../../shared/contracts';
const CodeEditor = lazy(() => import('../components/CodeEditor'));
type Draft = { content: string; baseVersion: number };
const latest = (files: GeneratedFile[]) => {
  const result = new Map<string, GeneratedFile>();
  files.forEach((f) => {
    if ((result.get(f.path)?.version ?? 0) < f.version) result.set(f.path, f);
  });
  return [...result.values()].sort((a, b) => a.path.localeCompare(b.path));
};
export default function Workspace() {
  const { projectId, taskId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { config, refresh } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [allFiles, setAllFiles] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [tabs, setTabs] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<'code' | 'diff' | 'preview'>('code');
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamStage, setStreamStage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const [bottomTab, setBottomTab] = useState<'events' | 'tests' | 'build'>('events');
  const [prompt, setPrompt] = useState('');
  const [showTask, setShowTask] = useState(false);
  const [editScope, setEditScope] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobilePane, setMobilePane] = useState<'files' | 'code' | 'chat'>('code');
  const uploadRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [p, list, files] = await Promise.all([
        api<Project>(`/projects/${projectId}`),
        api<Task[]>(`/tasks?projectId=${projectId}`),
        api<GeneratedFile[]>(`/projects/${projectId}/files`),
      ]);
      setProject(p);
      setTasks(list);
      setAllFiles(files);
      if (taskId) {
        const d = await api<TaskDetail>(`/tasks/${taskId}`);
        if (d.task.projectId !== projectId) throw new Error('任务不属于当前项目。');
        setDetail(d);
        setAllFiles(d.files);
      } else {
        setDetail(null);
        if (list.length) navigate(`/workspace/${projectId}/${list[0].id}`, { replace: true });
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId, navigate]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useEffect(() => () => controller.current?.abort(), []);
  const currentFiles = latest(allFiles);
  const current = currentFiles.find((f) => f.path === selected);
  const history = allFiles.filter((f) => f.path === selected).sort((a, b) => b.version - a.version);
  const historical = version ? history.find((f) => f.version === version) : undefined;
  const visible = historical ?? current;
  const draft = drafts[selected];
  const code = historical?.content ?? draft?.content ?? current?.content ?? '';
  const task = detail?.task;
  const busy =
    running || (!!task && ['analyzing', 'generating', 'reviewing'].includes(task.status));
  const openFile = (path: string) => {
    setSelected(path);
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setVersion(0);
    setMobilePane('code');
  };
  useEffect(() => {
    if (currentFiles.length && !selected) {
      const first =
        currentFiles.find((f) => f.path.endsWith('.py') || f.path.endsWith('.tsx')) ??
        currentFiles[0];
      setSelected(first.path);
      setTabs([first.path]);
    }
  }, [currentFiles, selected]);
  const save = async (content = code) => {
    if (!selected || !current) return;
    setSaving(true);
    try {
      await api(`/projects/${projectId}/files`, {
        method: 'POST',
        body: JSON.stringify({
          path: selected,
          language: current.language,
          content,
          baseVersion: draft?.baseVersion ?? current.version,
        }),
      });
      await load();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[selected];
        return next;
      });
      setVersion(0);
      toast('文件已保存为新版本。');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const run = async (stage: Stage) => {
    if (!taskId) return;
    setRunning(true);
    setStreamText('');
    setStreamStage(stage);
    setMobilePane('chat');
    const abort = new AbortController();
    controller.current = abort;
    try {
      await runStream(
        taskId,
        stage,
        (type, data) => {
          if (type === 'delta') setStreamText((prev) => (prev + String(data.text)).slice(-30000));
          if (type === 'error') toast(String(data.message), 'error');
          if (type === 'complete')
            toast(
              stage === 'analyze'
                ? '分析完成，请确认方案。'
                : stage === 'generate'
                  ? '代码已保存，可继续静态审查。'
                  : 'AI 静态审查已完成。',
            );
        },
        abort.signal,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        toast((e as Error).message, 'error');
    } finally {
      controller.current = null;
      setRunning(false);
      await load();
      await refresh();
    }
  };
  const cancel = async () => {
    if (!taskId) return;
    try {
      await api(`/tasks/${taskId}/cancel`, { method: 'POST', body: '{}' });
      controller.current?.abort();
      await load();
      toast('已请求取消，未知用量会保留待核对。');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const confirm = async () => {
    if (!task) return;
    try {
      await api(`/tasks/${task.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ scopeVersion: task.version }),
      });
      await load();
      toast('任务范围已确认。');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const createTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editScope && task) {
        await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ prompt }) });
        setEditScope(false);
        await load();
      } else {
        const result = await api<Task>('/tasks', {
          method: 'POST',
          body: JSON.stringify({ projectId, prompt }),
        });
        navigate(`/workspace/${projectId}/${result.id}`);
      }
      setPrompt('');
      setShowTask(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const addFile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const path = String(data.get('path'));
    const ext = path.split('.').pop();
    setSaving(true);
    try {
      await api(`/projects/${projectId}/files`, {
        method: 'POST',
        body: JSON.stringify({
          path,
          content: String(data.get('content')),
          language:
            ext === 'py'
              ? 'python'
              : ext === 'ts' || ext === 'tsx'
                ? 'typescript'
                : ext === 'md'
                  ? 'markdown'
                  : (ext ?? 'plaintext'),
          baseVersion: 0,
        }),
      });
      setNewFile(false);
      await load();
      openFile(path);
      toast('文件已添加。');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file: File) => {
    try {
      if (file.size > 100000) throw new Error('单个源码文件最多 100 KB。');
      const content = await file.text();
      const path = file.name;
      const ext = path.split('.').pop();
      await api(`/projects/${projectId}/files`, {
        method: 'POST',
        body: JSON.stringify({
          path,
          content,
          language:
            ext === 'py'
              ? 'python'
              : ext === 'ts' || ext === 'tsx'
                ? 'typescript'
                : ext === 'md'
                  ? 'markdown'
                  : (ext ?? 'plaintext'),
          baseVersion: 0,
        }),
      });
      await load();
      openFile(path);
      toast('源码已导入；文件仅作为不可信文本处理。');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };
  const exportProject = async () => {
    try {
      await download(`/projects/${projectId}/export`, `${project?.name ?? 'horidev'}.zip`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const fileDownload = async () => {
    try {
      await download(
        `/projects/${projectId}/download?path=${encodeURIComponent(selected)}${version ? `&version=${version}` : ''}`,
        selected.split('/').pop()!,
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const filesGenerated = detail?.files.some((f) => f.taskId === taskId);
  const previous = history.find((f) => f.version < (historical?.version ?? current?.version ?? 0));
  const cost = detail?.usage.reduce((sum, u) => sum + u.costMicros, 0) ?? 0;
  const reserved = detail?.usage.reduce((sum, u) => sum + u.reservedMicros, 0) ?? 0;
  const tokens =
    detail?.usage.reduce((sum, u) => sum + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0) ?? 0;
  const retryStage = (detail?.usage.at(-1)?.stage ?? 'analyze') as Stage;
  return (
    <Shell workspace>
      <main className="workspace">
        <header className="workspace-toolbar">
          <div>
            <Link to="/dashboard" className="icon-button" aria-label="返回工作台">
              <ArrowLeft size={17} />
            </Link>
            <span className="toolbar-divider" />
            <FolderOpen size={17} />
            <h1>{project?.name ?? '项目工作区'}</h1>
            <span className="tiny-tag">{config?.mode === 'demo' ? 'DEMO' : 'LIVE'}</span>
          </div>
          <div>
            <span className="workspace-private">
              <ShieldCheck size={13} /> 私有项目
            </span>
            <button
              className="button small secondary"
              disabled={!currentFiles.length}
              onClick={() => void exportProject()}
            >
              <Download size={15} /> 导出 ZIP
            </button>
          </div>
        </header>
        <div className="workspace-mobile-tabs">
          <button
            className={mobilePane === 'files' ? 'active' : ''}
            onClick={() => setMobilePane('files')}
          >
            <ListTree size={15} />
            文件
          </button>
          <button
            className={mobilePane === 'code' ? 'active' : ''}
            onClick={() => setMobilePane('code')}
          >
            <Code2 size={15} />
            代码
          </button>
          <button
            className={mobilePane === 'chat' ? 'active' : ''}
            onClick={() => setMobilePane('chat')}
          >
            <MessageSquare size={15} />
            AI 助手
          </button>
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} retry={() => void load()} />
        ) : (
          <div className={`workspace-grid show-${mobilePane}`}>
            <aside className="file-panel">
              <div className="panel-label">
                项目文件
                <div>
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={() => setNewFile(true)}
                    aria-label="新建文件"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={() => uploadRef.current?.click()}
                    aria-label="导入源码文件"
                  >
                    <Upload size={14} />
                  </button>
                  <input
                    ref={uploadRef}
                    type="file"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                    accept=".py,.ts,.tsx,.js,.jsx,.md,.json,.html,.css,.txt,.sql,.yaml,.yml,.toml,.csv"
                  />
                </div>
              </div>
              <div className="filetree-root">
                <ChevronDown size={13} />
                <FolderOpen size={14} />
                {project?.name}
              </div>
              <nav className="file-list" aria-label="项目文件">
                {currentFiles.map((file) => (
                  <button
                    key={file.path}
                    className={selected === file.path ? 'selected' : ''}
                    onClick={() => openFile(file.path)}
                  >
                    <FileCode2
                      size={14}
                      className={file.language === 'python' ? 'python-file' : ''}
                    />
                    <span>{file.path}</span>
                    {drafts[file.path] && <i className="unsaved-dot" />}
                  </button>
                ))}
                {!currentFiles.length && (
                  <p className="filetree-empty">
                    生成或导入后，
                    <br />
                    文件会出现在这里。
                  </p>
                )}
              </nav>
              <div className="task-history">
                <div className="panel-label">
                  任务历史
                  <button
                    className="icon-button"
                    onClick={() => {
                      setShowTask(true);
                      setEditScope(false);
                      setPrompt('');
                    }}
                    aria-label="新建任务"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {tasks.map((item) => (
                  <Link
                    key={item.id}
                    className={item.id === taskId ? 'selected' : ''}
                    to={`/workspace/${projectId}/${item.id}`}
                  >
                    <History size={13} />
                    <span>{item.title}</span>
                    <i className={`history-dot ${item.status}`} />
                  </Link>
                ))}
              </div>
              <div className="file-panel-foot">
                <LockIcon />
                <span>项目仅对你可见</span>
              </div>
            </aside>
            <section className="editor-panel">
              <div className="editor-tabs">
                {tabs.map((path) => (
                  <div className={selected === path ? 'active' : ''} key={path}>
                    <button onClick={() => openFile(path)}>
                      <FileCode2 size={13} />
                      {path.split('/').pop()}
                      {drafts[path] && <i className="unsaved-dot" />}
                    </button>
                    <button
                      aria-label={`关闭 ${path}`}
                      onClick={() => {
                        setTabs((prev) => prev.filter((p) => p !== path));
                        if (selected === path) setSelected(tabs.find((p) => p !== path) ?? '');
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {current ? (
                <>
                  <div className="editor-tools">
                    <div className="segmented">
                      <button
                        className={view === 'code' ? 'active' : ''}
                        onClick={() => setView('code')}
                      >
                        <Code2 size={13} />
                        代码
                      </button>
                      <button
                        className={view === 'diff' ? 'active' : ''}
                        onClick={() => setView('diff')}
                      >
                        <GitCompareArrows size={13} />
                        Diff
                      </button>
                      <button
                        className={view === 'preview' ? 'active' : ''}
                        onClick={() => setView('preview')}
                      >
                        <Eye size={13} />
                        预览
                      </button>
                    </div>
                    <div>
                      <select
                        aria-label="文件版本"
                        value={version}
                        onChange={(e) => setVersion(Number(e.target.value))}
                      >
                        <option value={0}>最新 · v{current.version}</option>
                        {history
                          .filter((f) => f.version !== current.version)
                          .map((f) => (
                            <option key={f.id} value={f.version}>
                              v{f.version} · {time(f.createdAt)}
                            </option>
                          ))}
                      </select>
                      <button
                        className="icon-button"
                        onClick={() => void fileDownload()}
                        aria-label="下载此文件"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        className="button small secondary"
                        onClick={() => void save()}
                        disabled={busy || saving || (!draft && !historical)}
                      >
                        <Save size={13} />
                        {historical ? '恢复为新版本' : '保存'}
                      </button>
                    </div>
                  </div>
                  <div className="editor-main">
                    {view === 'preview' ? (
                      selected.endsWith('.html') ? (
                        <div className="html-preview">
                          <div className="preview-notice">
                            <ShieldCheck size={13} />
                            静态 HTML 预览 · 脚本、网络、表单与弹窗已禁用
                          </div>
                          <iframe
                            title="生成 HTML 的隔离静态预览"
                            sandbox=""
                            referrerPolicy="no-referrer"
                            srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'">${code}`}
                          />
                        </div>
                      ) : (
                        <div className="text-preview">
                          <span className="eyebrow">SOURCE PREVIEW</span>
                          <pre>{code}</pre>
                          <p>仅 HTML 支持隔离页面预览。程序执行与构建未启用。</p>
                        </div>
                      )
                    ) : (
                      <Suspense fallback={<Spinner label="正在载入编辑器…" />}>
                        <CodeEditor
                          path={`${projectId}/${selected}`}
                          language={visible?.language ?? 'plaintext'}
                          value={code}
                          original={view === 'diff' ? (previous?.content ?? '') : undefined}
                          readOnly={busy || !!historical}
                          onChange={(content) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [selected]: {
                                content,
                                baseVersion: prev[selected]?.baseVersion ?? current.version,
                              },
                            }))
                          }
                        />
                      </Suspense>
                    )}
                  </div>
                  <div className="editor-status">
                    <span>
                      <Code2 size={11} />
                      {visible?.language} · UTF-8
                    </span>
                    <span>
                      {historical
                        ? `历史版本 v${historical.version} · 只读`
                        : draft
                          ? '修改尚未保存'
                          : `已保存 · v${current.version}`}
                    </span>
                  </div>
                </>
              ) : (
                <div className="editor-welcome">
                  <span className="welcome-logo">H</span>
                  <h2>为想法，打开一个新世界。</h2>
                  <p>
                    在右侧描述需求，确认方案后开始生成。
                    <br />
                    你也可以导入现有源码，进行修改与重构。
                  </p>
                  <div className="editor-welcome-actions">
                    <button
                      onClick={() => {
                        setShowTask(true);
                        setEditScope(false);
                        setPrompt('');
                      }}
                    >
                      <Sparkles size={16} /> 描述需求 <ArrowUpRight size={14} />
                    </button>
                    <button disabled={busy} onClick={() => setNewFile(true)}>
                      <Plus size={16} /> 新建源码文件 <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <small>
                    <ShieldCheck size={12} /> 源码完整交付 · 无任意程序执行
                  </small>
                </div>
              )}
              <div className="events-panel">
                <div className="events-tabs">
                  <button
                    className={bottomTab === 'events' ? 'active' : ''}
                    onClick={() => setBottomTab('events')}
                  >
                    <Terminal size={13} />
                    事件日志
                  </button>
                  <button
                    className={bottomTab === 'tests' ? 'active' : ''}
                    onClick={() => setBottomTab('tests')}
                  >
                    <ShieldCheck size={13} />
                    测试 <span>未启用</span>
                  </button>
                  <button
                    className={bottomTab === 'build' ? 'active' : ''}
                    onClick={() => setBottomTab('build')}
                  >
                    <Code2 size={13} />
                    构建 <span>未启用</span>
                  </button>
                  <button className="icon-button" onClick={() => void load()} aria-label="刷新任务">
                    <RefreshCw size={12} />
                  </button>
                </div>
                <div className="events-content">
                  {bottomTab === 'events' ? (
                    detail?.events.length ? (
                      detail.events.map((item) => (
                        <div key={item.id} className={`event-line ${item.level}`}>
                          <time>
                            {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
                              hour12: false,
                            })}
                          </time>
                          <span>
                            {item.level === 'error' ? '!' : item.level === 'warning' ? '△' : '›'}
                          </span>
                          <p>{item.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="event-placeholder">
                        等待你的下一个想法。所有任务事件都会保存在这里。
                      </p>
                    )
                  ) : (
                    <div className="execution-disabled">
                      <CircleIcon />
                      <div>
                        <b>
                          {bottomTab === 'tests' ? '自动化测试尚未启用' : '构建与程序运行尚未启用'}
                        </b>
                        <p>
                          平台没有隔离执行服务，不运行上传或生成的程序。AI
                          静态审查不代表真实测试通过。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
            <aside className="assistant-panel">
              <div className="assistant-heading">
                <span className="assistant-avatar">
                  <Sparkles size={17} />
                </span>
                <div>
                  <b>HoriDev AI</b>
                  <small>你的创造伙伴</small>
                </div>
                <span className="tiny-tag">{task?.mode === 'demo' ? '演示' : 'AI'}</span>
              </div>
              <div className="assistant-scroll">
                {task ? (
                  <>
                    <div className="task-stage">
                      <span className={`status-badge ${task.status}`}>
                        {statusLabels[task.status]}
                      </span>
                      <small>任务 {task.id.slice(0, 8)}</small>
                    </div>
                    <div className="user-message">
                      <p>{task.prompt}</p>
                      {!busy && !['completed', 'cancelled'].includes(task.status) && (
                        <button
                          className="subtle"
                          onClick={() => {
                            setPrompt(task.prompt);
                            setEditScope(true);
                            setShowTask(true);
                          }}
                        >
                          <Pencil size={11} /> 修改需求
                        </button>
                      )}
                    </div>
                    {task.mode === 'demo' && (
                      <div className="demo-notice">
                        <Sparkles size={14} />
                        <p>
                          当前为预置 Excel 示例演示，不会针对任意输入生成新代码，没有 OpenAI 调用。
                        </p>
                      </div>
                    )}
                    {detail.order && task.mode === 'live' && !detail.order.approvedAt && (
                      <div className="notice warning">
                        <AlertTriangle size={17} />
                        <p>
                          订单待人工报价与资源授权。未确认前，任何付费阶段均会被服务端阻止。
                          <br />
                          订单 {detail.order.id.slice(0, 8)}
                        </p>
                      </div>
                    )}
                    {task.analysis && (
                      <div className="analysis-card">
                        <div className="assistant-section-title">
                          <Sparkles size={14} />
                          <b>需求与实现方案</b>
                        </div>
                        <p>{task.analysis.understanding}</p>
                        <ol>
                          {task.analysis.approach.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ol>
                        <div className="tech-tags">
                          {task.analysis.technologies.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                        <div className="analysis-meta">
                          <span>
                            复杂度：
                            {
                              { simple: '简单', medium: '中等', complex: '复杂' }[
                                task.analysis.complexity
                              ]
                            }
                          </span>
                          <span>预计 {task.analysis.estimatedTokens.toLocaleString()} Tokens</span>
                        </div>
                        <small className="subtle">
                          预计量来自方案，实际用量以 API usage 为准。
                        </small>
                        <b className="deliverables-title">预计交付</b>
                        {task.analysis.deliverables.map((f) => (
                          <div className="deliverable" key={f}>
                            <FileCode2 size={13} />
                            {f}
                          </div>
                        ))}
                        {task.analysis.questions.length > 0 && (
                          <div className="questions">
                            <b>需要确认</b>
                            {task.analysis.questions.map((q) => (
                              <p key={q}>{q}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {detail.messages
                      .filter(
                        (m) =>
                          m.role === 'assistant' &&
                          m.kind !== 'analyze' &&
                          m.content !== task.analysis?.understanding,
                      )
                      .map((m) => (
                        <div className="assistant-message" key={m.id}>
                          <span className="mini-ai">✦</span>
                          <p>{m.content}</p>
                        </div>
                      ))}
                    {task.review && (
                      <div className="review-card">
                        <div className="assistant-section-title">
                          <ShieldCheck size={15} />
                          <b>AI 静态审查</b>
                        </div>
                        <p>{task.review.summary}</p>
                        {task.review.issues.map((issue, i) => (
                          <div className={`review-issue ${issue.severity}`} key={i}>
                            <span>
                              {issue.severity === 'critical'
                                ? '高风险'
                                : issue.severity === 'warning'
                                  ? '注意'
                                  : '建议'}
                            </span>
                            <b>{issue.file}</b>
                            <p>{issue.message}</p>
                          </div>
                        ))}
                        {task.review.coverage.map((c) => (
                          <p className="coverage-item" key={c}>
                            <Check size={12} />
                            {c}
                          </p>
                        ))}
                        <small>运行与自动化测试未启用。</small>
                      </div>
                    )}
                    {task.error && (
                      <div className="notice error">
                        <AlertTriangle size={17} />
                        <p>{task.error}</p>
                      </div>
                    )}
                    {running && (
                      <div className="stream-card">
                        <div>
                          <LoaderCircle className="spin" size={14} />
                          {streamStage === 'analyze'
                            ? '正在分析需求'
                            : streamStage === 'generate'
                              ? '正在生成源码'
                              : '正在进行静态审查'}
                        </div>
                        <pre>{streamText || '等待模型响应…'}</pre>
                        <small>流式片段尚未验证，完成后才会保存文件。</small>
                      </div>
                    )}
                    {!running && busy && (
                      <div className="notice">
                        <Clock3 size={16} />
                        <p>此任务正在另一连接处理。可刷新状态或请求取消。</p>
                      </div>
                    )}
                    {!running && busy && Date.now() - task.updatedAt > 240000 && (
                      <button
                        className="button secondary full"
                        onClick={() =>
                          void api(`/tasks/${task.id}/recover`, { method: 'POST', body: '{}' })
                            .then(load)
                            .catch((e) => toast((e as Error).message, 'error'))
                        }
                      >
                        恢复已中断的任务
                      </button>
                    )}
                  </>
                ) : (
                  <Empty
                    icon={<Sparkles size={27} />}
                    title="从一句话开始。"
                    description="告诉 HoriDev 你想实现什么，方案、源码和交付过程都会记录在这里。"
                    action={
                      <button
                        className="button primary"
                        onClick={() => {
                          setShowTask(true);
                          setEditScope(false);
                        }}
                      >
                        描述我的需求
                      </button>
                    }
                  />
                )}
              </div>
              <footer className="assistant-footer">
                {task && (
                  <>
                    <div className="usage-mini">
                      <span>{tokens.toLocaleString()} Tokens</span>
                      <span>
                        {money(cost)}
                        {reserved > 0 ? ` + ${money(reserved)} 待确认` : ''}
                      </span>
                    </div>
                    <div className="task-actions">
                      {busy ? (
                        <button className="button secondary full" onClick={() => void cancel()}>
                          <Square size={13} /> 取消任务
                        </button>
                      ) : task.status === 'draft' ? (
                        <button className="button primary full" onClick={() => void run('analyze')}>
                          <Sparkles size={16} /> 分析需求
                        </button>
                      ) : task.status === 'awaiting_confirmation' ? (
                        <button className="button primary full" onClick={() => void confirm()}>
                          <Check size={16} /> 确认范围与方案
                        </button>
                      ) : task.status === 'ready' ? (
                        <button
                          className="button primary full"
                          onClick={() => void run(filesGenerated ? 'review' : 'generate')}
                        >
                          {filesGenerated ? <ShieldCheck size={16} /> : <Code2 size={16} />}{' '}
                          {filesGenerated ? '开始 AI 静态审查' : '开始生成代码'}
                        </button>
                      ) : task.status === 'failed' ? (
                        <button
                          className="button secondary full"
                          onClick={() => void run(retryStage)}
                        >
                          <RefreshCw size={15} /> 重试当前阶段
                        </button>
                      ) : (
                        <button
                          className="button primary full"
                          onClick={() => {
                            setShowTask(true);
                            setEditScope(false);
                            setPrompt('');
                          }}
                        >
                          <Plus size={16} /> 追加开发任务
                        </button>
                      )}
                    </div>
                    <button
                      className="new-task-link"
                      onClick={() => {
                        setShowTask(true);
                        setEditScope(false);
                        setPrompt('');
                      }}
                    >
                      还有新想法？新建任务 <ArrowUpRight size={11} />
                    </button>
                  </>
                )}
                <small className="assistant-disclaimer">
                  AI 可能出错，请检查源码。费用为内部估算。
                </small>
              </footer>
            </aside>
          </div>
        )}
      </main>
      {showTask && (
        <Modal
          title={editScope ? '调整任务需求' : '描述下一个想法'}
          onClose={() => setShowTask(false)}
        >
          <form onSubmit={(e) => void createTask(e)}>
            <label>
              开发需求
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={7}
                minLength={10}
                maxLength={12000}
                required
                placeholder="描述目标、现有问题、期望文件与使用场景…"
              />
            </label>
            <div className="notice">
              {editScope
                ? '修改后需要重新分析和确认范围，已有真实资源授权将撤销。'
                : '新任务会读取当前已保存的项目文件作为上下文。请先保存编辑。'}
            </div>
            <button className="button primary full" disabled={saving}>
              {saving ? '正在保存…' : editScope ? '保存并重新分析' : '创建开发任务'}
              <ArrowUp size={16} />
            </button>
          </form>
        </Modal>
      )}
      {newFile && (
        <Modal title="添加源码文件" onClose={() => setNewFile(false)}>
          <form onSubmit={(e) => void addFile(e)}>
            <label>
              相对路径
              <input name="path" required maxLength={180} placeholder="例如：src/main.py" />
            </label>
            <label>
              源码内容
              <textarea
                name="content"
                className="code-input"
                rows={10}
                maxLength={100000}
                placeholder="# 在这里编写或粘贴源码"
              />
            </label>
            <p className="subtle">
              仅接受受限文本格式，每个文件最多 100 KB，不支持目录穿越或私密配置文件。
            </p>
            <button className="button primary full" disabled={saving}>
              添加文件
            </button>
          </form>
        </Modal>
      )}
    </Shell>
  );
}
function LockIcon() {
  return <ShieldCheck size={12} />;
}
function CircleIcon() {
  return <AlertTriangle size={21} />;
}
