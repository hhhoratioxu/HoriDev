import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserRound, Sparkles, Globe2, LockKeyhole } from 'lucide-react';
import { Shell } from '../components/ui';
import { useAuth, useToast } from '../lib/context';
import { api, money } from '../lib/api';
export function SettingsPage() {
  const { me, config, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = new FormData(e.currentTarget);
      await api('/me', { method: 'PATCH', body: JSON.stringify({ name: d.get('name') }) });
      await refresh();
      toast('个人资料已保存。');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const password = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const d = new FormData(form);
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: d.get('currentPassword'),
          newPassword: d.get('newPassword'),
          revokeOtherSessions: true,
        }),
      });
      form.reset();
      toast('密码已更新，其他会话已撤销。');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <main className="page-container settings-page">
        <div className="page-title-row">
          <div>
            <span className="eyebrow">MAKE YOURSELF AT HOME</span>
            <h1>个人设置</h1>
            <p>为你的创造空间，添一点自己的习惯。</p>
          </div>
        </div>
        <div className="settings-grid">
          <section className="settings-card glass">
            <h2>
              <UserRound size={19} /> 个人资料
            </h2>
            <form onSubmit={(e) => void submit(e)}>
              <label>
                显示名称
                <input name="name" defaultValue={me?.user.name} required maxLength={60} />
              </label>
              <label>
                登录邮箱
                <input value={me?.user.email ?? ''} readOnly />
              </label>
              <button className="button primary" disabled={busy}>
                保存资料
              </button>
            </form>
          </section>
          <section className="settings-card glass">
            <h2>
              <LockKeyhole size={19} /> 账号安全
            </h2>
            <form onSubmit={(e) => void password(e)}>
              <label>
                当前密码
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                新密码
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <button className="button secondary" disabled={busy}>
                更新密码并撤销其他会话
              </button>
            </form>
            <p className="subtle">邮件找回与邮箱验证尚未配置，首版请妥善保存密码。</p>
          </section>
          <section className="settings-card glass">
            <h2>
              <Sparkles size={19} /> 模型与用量
            </h2>
            <dl>
              <dt>运行模式</dt>
              <dd>{config?.mode === 'demo' ? 'Demo · 预置演示' : 'Live · 真实 API'}</dd>
              <dt>真实调用开关</dt>
              <dd>{config?.liveEnabled ? '已启用' : '未启用'}</dd>
              <dt>已记录费用估算</dt>
              <dd>{money(me?.usage.costMicros ?? 0)}</dd>
              <dt>待确认预留</dt>
              <dd>{money(me?.usage.reservedMicros ?? 0)}</dd>
              <dt>用户内部额度</dt>
              <dd>{money(me?.limitMicros ?? 0)}</dd>
              <dt>文件存储</dt>
              <dd>{config?.storage}</dd>
            </dl>
          </section>
          <section className="settings-card glass">
            <h2>
              <ShieldCheck size={19} /> 你的数据与边界
            </h2>
            <p>
              项目、任务和文件仅对所属账号开放。生成文件不会在平台执行。导出前请自行检查源码与依赖。
            </p>
            <p>API 密钥由服务端配置，浏览器无法读取。不要在需求和源码中上传凭据。</p>
            <div className="notice">
              <Globe2 size={16} />
              <span>
                默认简体中文；国际化字典已预留英文结构。地区和服务使用须符合 Cloudflare 与 OpenAI
                的可用性及政策要求。
              </span>
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}
