import { Component, useEffect, type ReactNode, type ErrorInfo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Menu,
  X,
  Sun,
  Moon,
  LayoutDashboard,
  FolderKanban,
  Settings,
  ShieldCheck,
  LogOut,
  LoaderCircle,
  Sparkles,
  ChevronRight,
  Command,
  PanelLeftClose,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth, useTheme, useToast } from '../lib/context';
import { api } from '../lib/api';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="HoriDev 首页">
      <span className="logo-mark">
        <span />
      </span>
      {!compact && (
        <span>
          HoriDev<span className="logo-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function ThemeButton() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="icon-button"
      onClick={toggle}
      aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
export function Navbar() {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="marketing-nav glass">
      <Logo />
      <nav className={open ? 'nav-links open' : 'nav-links'} aria-label="主导航">
        <a href="/#services" onClick={() => setOpen(false)}>
          产品能力
        </a>
        <a href="/#workflow" onClick={() => setOpen(false)}>
          如何工作
        </a>
        <NavLink to="/pricing" onClick={() => setOpen(false)}>
          价格方案
        </NavLink>
        <a href="/#faq" onClick={() => setOpen(false)}>
          常见问题
        </a>
      </nav>
      <div className="nav-actions">
        <ThemeButton />
        <Link className="nav-login" to={me ? '/dashboard' : '/login'}>
          {me ? '工作台' : '登录'}
        </Link>
        <Link className="button small dark" to={me ? '/dashboard' : '/register'}>
          开始创建 <ArrowUpRight size={15} />
        </Link>
        <button
          className="icon-button mobile-menu"
          onClick={() => setOpen(!open)}
          aria-label="展开导航"
          aria-expanded={open}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}
export function Shell({
  children,
  workspace = false,
}: {
  children: ReactNode;
  workspace?: boolean;
}) {
  const { me, config, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const logout = async () => {
    try {
      await api('/auth/sign-out', { method: 'POST', body: '{}' });
      await refresh();
      navigate('/');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div
      className={`app-shell ${workspace ? 'workspace-shell' : ''} ${collapsed ? 'nav-collapsed' : ''}`}
    >
      <aside className="app-sidebar glass">
        <div className="sidebar-logo">
          <Logo compact={collapsed} />
          <button
            className="icon-button collapse-sidebar"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="收起侧栏"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="sidebar-section-label">创造空间</div>
        <nav className="app-navigation">
          <NavLink to="/dashboard">
            <LayoutDashboard size={19} />
            <span>工作台</span>
            <ChevronRight size={13} />
          </NavLink>
          <NavLink to="/projects">
            <FolderKanban size={19} />
            <span>我的项目</span>
          </NavLink>
          <NavLink to="/settings">
            <Settings size={19} />
            <span>个人设置</span>
          </NavLink>
          {me?.user.role === 'admin' && (
            <NavLink to="/admin">
              <ShieldCheck size={19} />
              <span>管理后台</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <Sparkles size={18} />
            <strong>{config?.mode === 'demo' ? '探索模式' : 'Live 模式'}</strong>
            <p>
              {config?.mode === 'demo' ? '预置示例，零 API 消耗。' : '真实调用受预算和订单限制。'}
            </p>
            <Link to="/pricing">
              了解使用方案 <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="user-strip">
            <span className="avatar">{me?.user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{me?.user.name}</b>
              <small>{me?.user.role === 'admin' ? '平台管理员' : '个人工作空间'}</small>
            </div>
            <button className="icon-button" onClick={() => void logout()} aria-label="退出登录">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <div>
            <Command size={15} />
            <span>你的想法，值得被实现。</span>
          </div>
          <div>
            <span className={`status-dot ${config?.mode === 'live' ? 'live' : ''}`} />
            <span>{config?.mode === 'demo' ? 'Demo · 预置演示' : 'Live · 真实 API'}</span>
            <ThemeButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Spinner({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon ?? <FolderKanban size={30} />}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <b>暂时遇到问题</b>
      <p>{message}</p>
      {retry && (
        <button className="button small secondary" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const dialog = document.querySelector('[role="dialog"]');
        const targets = dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input,textarea,select,a[href]',
        );
        if (!targets?.length) return;
        const first = targets[0],
          last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(
            '[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] button',
          )
          ?.focus(),
      30,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal glass" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭窗口">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.error ? (
      <main className="fatal-error">
        <Logo />
        <h1>页面暂时无法显示。</h1>
        <p>刷新页面后重试，已保存的项目仍在。</p>
        <button className="button primary" onClick={() => location.reload()}>
          刷新页面
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
