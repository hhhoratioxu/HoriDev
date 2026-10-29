import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ShieldCheck, LoaderCircle } from 'lucide-react';
import { Logo, ThemeButton } from '../components/ui';
import { useAuth } from '../lib/context';
import { api } from '../lib/api';
export function AuthPage({ register = false }: { register?: boolean }) {
  const { me, config, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (me) return <Navigate to="/dashboard" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(register ? '/auth/sign-up/email' : '/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          ...(register ? { name: data.get('name') } : {}),
        }),
      });
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-top">
        <Logo />
        <ThemeButton />
      </div>
      <div className="auth-orb" />
      <section className="auth-card glass">
        <Link to="/" className="subtle back-link">
          <ArrowLeft size={14} /> 返回首页
        </Link>
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <h1>{register ? '创造，从这里开始。' : '欢迎回来。'}</h1>
        <p>{register ? '给你的好想法，一个实现的机会。' : '继续把想法，变成触手可及的作品。'}</p>
        {register && config && !config.registration ? (
          <div className="notice warning">当前平台采用邀请注册，请联系运营方。</div>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            {register && (
              <label>
                你的名字
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={60}
                  placeholder="怎么称呼你"
                />
              </label>
            )}
            <label>
              邮箱地址
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                maxLength={200}
              />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={12}
                maxLength={128}
                placeholder="至少 12 位字符"
              />
            </label>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <>
                  {register ? '创建账号' : '登录 HoriDev'}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        )}
        <div className="auth-switch">
          {register ? '已经有账号？' : '还没有账号？'}
          <Link to={register ? '/login' : '/register'}>{register ? '登录' : '免费注册'}</Link>
        </div>
        <div className="auth-foot">
          <ShieldCheck size={15} />
          <span>安全会话 · 私有项目 · 你的代码归你</span>
        </div>
      </section>
      <small className="auth-copyright">HoriDev — AI-Powered Software Development</small>
    </main>
  );
}
