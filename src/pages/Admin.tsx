import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ShieldCheck,
  UsersRound,
  Activity,
  Sparkles,
  Coins,
  ArrowUpRight,
  RefreshCw,
  LockKeyhole,
  Settings2,
  Save,
  AlertTriangle,
  Check,
  ReceiptText,
  FileClock,
} from 'lucide-react';
import { Shell, Spinner, ErrorBox, Modal, Empty } from '../components/ui';
import { useAuth, useToast } from '../lib/context';
import { api, ApiError, money, time } from '../lib/api';
import type { PlatformSettings, Plan, Order } from '../../shared/contracts';
type AdminData = {
  settings: PlatformSettings;
  userCount: { n: number };
  active: { n: number };
  counts: { status: string; n: number }[];
  usage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    reservedMicros: number;
  };
  daily: { day: string; costMicros: number; reservedMicros: number }[];
  users: {
    id: string;
    name: string;
    email: string;
    limitMicros: number | null;
    usedMicros: number;
  }[];
  exceptions: { id: string; title: string; error: string; status: string; updatedAt: number }[];
  unsettled: {
    id: string;
    userId: string;
    taskId: string;
    reservedMicros: number;
    status: string;
  }[];
  orders: Order[];
  plans: Plan[];
  audit: { id: string; action: string; target: string; createdAt: number }[];
};
export default function Admin() {
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [reconcile, setReconcile] = useState<AdminData['unsettled'][number] | null>(null);
  const [tab, setTab] = useState<'overview' | 'users' | 'settings' | 'orders'>('overview');
  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>('/admin/overview'));
      setLocked(false);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ADMIN_REAUTH') setLocked(true);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (me?.user.role === 'admin') void load();
    else setLoading(false);
  }, [load, me?.user.role]);
  const unlock = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    try {
      await api('/admin/unlock', {
        method: 'POST',
        body: JSON.stringify({ password: new FormData(form).get('password') }),
      });
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const value = { ...data.settings };
      for (const key of [
        'totalBudgetUsd',
        'softBudgetUsd',
        'hardBudgetUsd',
        'safetyReserveUsd',
        'defaultUserLimitUsd',
        'taskLimitUsd',
        'maxConcurrent',
        'maxTaskCalls',
      ] as const)
        value[key] = Number(form.get(key));
      value.maintenance = form.get('maintenance') === 'on';
      value.aiEnabled = form.get('aiEnabled') === 'on';
      value.modelPrices = JSON.parse(
        String(form.get('modelPrices')),
      ) as PlatformSettings['modelPrices'];
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify(value) });
      toast('预算和平台设置已更新。');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const approve = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(`/admin/orders/${order.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          quoteCents: Math.round(Number(form.get('quoteUsd')) * 100),
          acknowledge: form.get('acknowledge') === 'on',
        }),
      });
      setOrder(null);
      toast('订单资源授权已记录，未发生在线收款。');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const settle = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reconcile) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(`/admin/usage/${reconcile.id}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({
          costMicros: Math.round(Number(form.get('costUsd')) * 1000000),
          note: form.get('note'),
        }),
      });
      setReconcile(null);
      toast('人工核对记录已保存。');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const savePlan = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(`/admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.get('name'),
          description: form.get('description'),
          priceLabel: form.get('priceLabel'),
          features: String(form.get('features'))
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          taskLimit: Number(form.get('taskLimit')),
          active: form.get('active') === 'on',
          highlighted: form.get('highlighted') === 'on',
        }),
      });
      setPlan(null);
      toast('套餐目录已更新。');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const totalTasks = data?.counts.reduce((n, c) => n + c.n, 0) ?? 0;
  const sum = (data?.usage.costMicros ?? 0) + (data?.usage.reservedMicros ?? 0);
  const hard = (data?.settings.hardBudgetUsd ?? 42) * 1000000;
  const maxDaily = Math.max(1, ...(data?.daily.map((d) => d.costMicros + d.reservedMicros) ?? []));
  return (
    <Shell>
      <main className="page-container admin-page">
        <div className="page-title-row">
          <div>
            <span className="eyebrow">HORIDEV CONTROL CENTER</span>
            <h1>让每一次创造，清晰可控。</h1>
            <p>平台运营、模型成本与资源授权。</p>
          </div>
          <div className="inline-actions">
            <span className="tiny-tag">
              <ShieldCheck size={12} /> ADMIN
            </span>
            {data && !locked && (
              <>
                <button className="icon-button" onClick={() => void load()} aria-label="刷新后台">
                  <RefreshCw size={17} />
                </button>
                <button
                  className="button small secondary"
                  onClick={() =>
                    void api('/admin/lock', { method: 'POST', body: '{}' }).then(() => {
                      setData(null);
                      setLocked(true);
                    })
                  }
                >
                  <LockKeyhole size={14} />
                  锁定
                </button>
              </>
            )}
          </div>
        </div>
        {me?.user.role !== 'admin' ? (
          <ErrorBox message="此账号没有管理员权限。管理员由服务端用户 ID 白名单授权。" />
        ) : loading ? (
          <Spinner />
        ) : locked ? (
          <section className="admin-unlock glass">
            <span className="service-icon">
              <LockKeyhole size={24} />
            </span>
            <h2>验证身份，继续管理。</h2>
            <p>管理员需要再次验证登录密码。管理会话有效期为 15 分钟，并绑定当前登录会话。</p>
            <form onSubmit={(e) => void unlock(e)}>
              <label>
                管理员账号密码
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? '正在验证…' : '解锁管理后台'}
                <ArrowUpRight size={16} />
              </button>
            </form>
          </section>
        ) : error ? (
          <ErrorBox message={error} retry={() => void load()} />
        ) : (
          data && (
            <>
              <div className="admin-tabs segmented">
                {[
                  { id: 'overview', label: '平台概览', icon: Activity },
                  { id: 'users', label: '用户与额度', icon: UsersRound },
                  { id: 'orders', label: '订单与核账', icon: ReceiptText },
                  { id: 'settings', label: '预算与套餐', icon: Settings2 },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={tab === t.id ? 'active' : ''}
                    onClick={() => setTab(t.id as typeof tab)}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>
              {sum >= data.settings.softBudgetUsd * 1000000 && (
                <div className="notice warning">
                  <AlertTriangle size={19} />
                  <span>
                    {sum >= hard
                      ? '已达到硬预算，新的付费模型调用将被阻止。'
                      : '已达到软预算，请关注剩余额度。'}
                    已占用 {money(sum)}，硬预算 {money(hard)}。
                  </span>
                </div>
              )}
              {tab === 'overview' && (
                <>
                  <div className="stats-grid">
                    {[
                      {
                        label: '注册用户',
                        value: data.userCount.n,
                        detail: `${data.active.n} 位近 7 天活跃用户`,
                        icon: UsersRound,
                      },
                      {
                        label: '开发任务',
                        value: totalTasks,
                        detail: `${data.counts.find((c) => c.status === 'completed')?.n ?? 0} 完成 · ${data.counts.find((c) => c.status === 'failed')?.n ?? 0} 异常`,
                        icon: Activity,
                      },
                      {
                        label: '真实模型调用记录',
                        value: data.usage.calls,
                        detail: `${(data.usage.inputTokens + data.usage.outputTokens).toLocaleString()} 官方记录 Tokens`,
                        icon: Sparkles,
                      },
                      {
                        label: '已结算费用估算',
                        value: money(data.usage.costMicros),
                        detail: `${money(data.usage.reservedMicros)} 待确认预留`,
                        icon: Coins,
                      },
                    ].map((x) => (
                      <article className="stat-card glass" key={x.label}>
                        <span>
                          {x.label}
                          <x.icon size={17} />
                        </span>
                        <strong>{x.value}</strong>
                        <small>{x.detail}</small>
                      </article>
                    ))}
                  </div>
                  <div className="admin-charts">
                    <section className="chart-panel glass">
                      <div className="section-heading">
                        <div>
                          <h2>每日成本趋势</h2>
                          <p>最近 30 天 · USD · 已知估算与预留</p>
                        </div>
                        <span className="tiny-tag">实际记录</span>
                      </div>
                      {data.daily.length ? (
                        <div className="cost-chart" role="img" aria-label="最近30天模型成本趋势">
                          {data.daily.map((d) => (
                            <div
                              key={d.day}
                              title={`${d.day}：${money(d.costMicros)}，预留 ${money(d.reservedMicros)}`}
                            >
                              <span>{money(d.costMicros + d.reservedMicros)}</span>
                              <i
                                style={{
                                  height: `${Math.max(3, ((d.costMicros + d.reservedMicros) / maxDaily) * 140)}px`,
                                }}
                              />
                              <small>{d.day.slice(5)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={<Activity size={25} />}
                          title="尚无真实 API 成本"
                          description="真实调用发生后，将展示实际记录，演示数据不计入。"
                        />
                      )}
                    </section>
                    <aside className="quota-panel glass">
                      <div className="section-heading">
                        <h2>平台内部预算</h2>
                        <ShieldCheck size={18} />
                      </div>
                      <strong>{money(Math.max(0, hard - sum))}</strong>
                      <p>硬预算内剩余可用（含未确认预留）</p>
                      <div className="progress-track">
                        <i style={{ width: `${Math.min(100, (sum / hard) * 100)}%` }} />
                      </div>
                      <dl>
                        <dt>总测试预算</dt>
                        <dd>${data.settings.totalBudgetUsd}</dd>
                        <dt>软预算警戒</dt>
                        <dd>${data.settings.softBudgetUsd}</dd>
                        <dt>硬预算阈值</dt>
                        <dd>${data.settings.hardBudgetUsd}</dd>
                        <dt>安全预留</dt>
                        <dd>${data.settings.safetyReserveUsd}</dd>
                      </dl>
                      <small>内部预算不等于 OpenAI 账单上限。费用以配置价格估算。</small>
                    </aside>
                  </div>
                  <section className="admin-list glass">
                    <div className="section-heading">
                      <h2>任务异常</h2>
                      <AlertTriangle size={17} />
                    </div>
                    {data.exceptions.length ? (
                      data.exceptions.map((ex) => (
                        <div className="exception-row" key={ex.id}>
                          <div>
                            <b>{ex.title}</b>
                            <small>{ex.error}</small>
                          </div>
                          <time>{time(ex.updatedAt)}</time>
                        </div>
                      ))
                    ) : (
                      <p className="empty-inline">当前没有失败任务。</p>
                    )}
                  </section>
                </>
              )}
              {tab === 'users' && (
                <section className="admin-list glass">
                  <div className="section-heading">
                    <h2>用户资源管理</h2>
                    <span className="subtle">首版最多显示最近 200 位用户</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>用户</th>
                          <th>邮箱</th>
                          <th>已占用估算</th>
                          <th>内部额度（USD）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <b>{u.name}</b>
                              <small className="table-id">{u.id.slice(0, 12)}</small>
                            </td>
                            <td>{u.email}</td>
                            <td>{money(u.usedMicros)}</td>
                            <td>
                              <form
                                className="quota-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const limitUsd = Number(
                                    new FormData(e.currentTarget).get('limit'),
                                  );
                                  void api(`/admin/quotas/${u.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ limitUsd }),
                                  })
                                    .then(() => {
                                      toast('用户额度已保存。');
                                      return load();
                                    })
                                    .catch((e) => toast((e as Error).message, 'error'));
                                }}
                              >
                                <input
                                  aria-label={`${u.name} 的额度`}
                                  name="limit"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1000"
                                  defaultValue={
                                    (u.limitMicros ?? data.settings.defaultUserLimitUsd * 1000000) /
                                    1000000
                                  }
                                />
                                <button
                                  className="icon-button"
                                  aria-label={`保存 ${u.name} 的额度`}
                                >
                                  <Save size={15} />
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {tab === 'orders' && (
                <>
                  <div className="notice">
                    <ShieldCheck size={18} />
                    <p>
                      首版只提供模拟订单与人工资源授权。确认按钮不会收款；真实付费分析也需要先授权。修改需求会撤销原授权。
                    </p>
                  </div>
                  <section className="admin-list glass">
                    <div className="section-heading">
                      <h2>订单资源授权</h2>
                      <span className="subtle">最近 50 条</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>订单 / 任务</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>报价（USD）</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.orders.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <b>{o.id.slice(0, 8)}</b>
                                <small className="table-id">{o.taskId.slice(0, 8)}</small>
                              </td>
                              <td>{o.kind === 'simulated' ? '演示模拟' : '人工确认'}</td>
                              <td>{o.status}</td>
                              <td>${(o.quoteCents / 100).toFixed(2)}</td>
                              <td>
                                {o.kind === 'manual' &&
                                ['awaiting_quote', 'draft', 'awaiting_payment'].includes(
                                  o.status,
                                ) ? (
                                  <button
                                    className="button small secondary"
                                    onClick={() => setOrder(o)}
                                  >
                                    确认授权
                                  </button>
                                ) : (
                                  <span className="subtle">{o.approvedAt ? '已确认' : '—'}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.orders.length && <p className="empty-inline">还没有订单。</p>}
                    </div>
                  </section>
                  <section className="admin-list glass">
                    <div className="section-heading">
                      <h2>待核对的未知用量</h2>
                      <FileClock size={17} />
                    </div>
                    {data.unsettled.length ? (
                      data.unsettled.map((u) => (
                        <div className="exception-row" key={u.id}>
                          <div>
                            <b>调用 {u.id.slice(0, 8)}</b>
                            <small>
                              任务 {u.taskId.slice(0, 8)} · 保守预留 {money(u.reservedMicros)}
                            </small>
                          </div>
                          <button
                            className="button small secondary"
                            onClick={() => setReconcile(u)}
                          >
                            核对账单
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="empty-inline">没有待人工核对的用量。</p>
                    )}
                  </section>
                  <section className="admin-list glass">
                    <div className="section-heading">
                      <h2>管理员操作记录</h2>
                    </div>
                    {data.audit.map((a) => (
                      <div className="audit-line" key={a.id}>
                        <time>{time(a.createdAt)}</time>
                        <span>{a.action}</span>
                        <small>{a.target}</small>
                      </div>
                    ))}
                    {!data.audit.length && <p className="empty-inline">暂无管理员操作。</p>}
                  </section>
                </>
              )}
              {tab === 'settings' && (
                <>
                  <section className="settings-card glass">
                    <h2>
                      <Coins size={19} /> 预算与平台开关
                    </h2>
                    <form
                      key={JSON.stringify(data.settings)}
                      onSubmit={(e) => void saveSettings(e)}
                    >
                      <div className="form-grid">
                        {[
                          { key: 'totalBudgetUsd', name: '总测试预算（USD）', step: 0.01 },
                          { key: 'softBudgetUsd', name: '软预算（USD）', step: 0.01 },
                          { key: 'hardBudgetUsd', name: '硬预算（USD）', step: 0.01 },
                          { key: 'safetyReserveUsd', name: '安全预留（USD）', step: 0.01 },
                          { key: 'defaultUserLimitUsd', name: '默认用户额度（USD）', step: 0.01 },
                          { key: 'taskLimitUsd', name: '每任务上限（USD）', step: 0.01 },
                          { key: 'maxConcurrent', name: '全平台并发调用数', step: 1 },
                          { key: 'maxTaskCalls', name: '每任务最多调用次数', step: 1 },
                        ].map((f) => (
                          <label key={f.key}>
                            {f.name}
                            <input
                              type="number"
                              name={f.key}
                              step={f.step}
                              min="0"
                              required
                              defaultValue={Number(data.settings[f.key as keyof PlatformSettings])}
                            />
                          </label>
                        ))}
                      </div>
                      <label>
                        模型价格（每百万 Token 的美元价格）
                        <textarea
                          name="modelPrices"
                          className="code-input"
                          rows={8}
                          defaultValue={JSON.stringify(data.settings.modelPrices, null, 2)}
                          required
                        />
                      </label>
                      <p className="subtle">
                        必须为当前启用模型配置 input、cached、output
                        价格。价格变更会影响后续结算；最终以 OpenAI 账单为准。
                      </p>
                      <div className="checkbox-row">
                        <label>
                          <input
                            type="checkbox"
                            name="aiEnabled"
                            defaultChecked={data.settings.aiEnabled}
                          />{' '}
                          允许新 AI 任务
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            name="maintenance"
                            defaultChecked={data.settings.maintenance}
                          />{' '}
                          开启维护模式
                        </label>
                      </div>
                      <button className="button primary" disabled={busy}>
                        <Save size={16} /> 保存平台设置
                      </button>
                    </form>
                  </section>
                  <section className="admin-list glass">
                    <div className="section-heading">
                      <h2>套餐目录</h2>
                      <span className="subtle">目录配置不会自动授予用量额度</span>
                    </div>
                    <div className="admin-plans">
                      {data.plans.map((p) => (
                        <article key={p.id}>
                          <span className="tiny-tag">{p.active ? '启用' : '隐藏'}</span>
                          <h3>{p.name}</h3>
                          <p>{p.priceLabel}</p>
                          <small>{p.description}</small>
                          <button className="button small secondary" onClick={() => setPlan(p)}>
                            编辑套餐 <ArrowUpRight size={13} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )
        )}
      </main>
      {order && (
        <Modal title="人工确认资源授权" onClose={() => setOrder(null)}>
          <p>此操作允许该任务消耗真实 API 额度。请确认需求、报价和用户授权；系统不会在线收款。</p>
          <form onSubmit={(e) => void approve(e)}>
            <label>
              人工报价（USD）
              <input
                name="quoteUsd"
                type="number"
                min="0"
                step="0.01"
                max="100000"
                required
                defaultValue="0"
              />
            </label>
            <label className="checkbox-row">
              <input name="acknowledge" type="checkbox" required /> 我已核实任务范围并同意使用平台
              AI 资源
            </label>
            <button className="button primary full" disabled={busy}>
              <Check size={16} /> 记录人工授权
            </button>
          </form>
        </Modal>
      )}
      {reconcile && (
        <Modal title="核对未知用量" onClose={() => setReconcile(null)}>
          <p>请先核对 OpenAI 账单或请求记录。这里记录人工金额，不会补造官方 Token usage。</p>
          <form onSubmit={(e) => void settle(e)}>
            <label>
              核对金额（USD）
              <input type="number" name="costUsd" step="0.000001" min="0" max="100" required />
            </label>
            <label>
              核对依据
              <textarea
                name="note"
                rows={4}
                minLength={10}
                maxLength={500}
                required
                placeholder="说明账单依据与调整原因…"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              保存核对结果并释放预留
            </button>
          </form>
        </Modal>
      )}
      {plan && (
        <Modal title={`编辑 ${plan.name} 套餐`} onClose={() => setPlan(null)}>
          <form onSubmit={(e) => void savePlan(e)}>
            <div className="form-grid">
              <label>
                名称
                <input name="name" defaultValue={plan.name} required maxLength={40} />
              </label>
              <label>
                价格说明
                <input name="priceLabel" defaultValue={plan.priceLabel} maxLength={80} required />
              </label>
            </div>
            <label>
              一句话说明
              <input name="description" defaultValue={plan.description} maxLength={200} />
            </label>
            <label>
              功能列表（每行一条）
              <textarea name="features" rows={5} defaultValue={plan.features.join('\n')} />
            </label>
            <label>
              目录建议任务数
              <input
                name="taskLimit"
                type="number"
                min="0"
                max="10000"
                defaultValue={plan.taskLimit}
              />
            </label>
            <div className="checkbox-row">
              <label>
                <input name="active" type="checkbox" defaultChecked={plan.active} /> 显示套餐
              </label>
              <label>
                <input name="highlighted" type="checkbox" defaultChecked={plan.highlighted} />{' '}
                推荐样式
              </label>
            </div>
            <button className="button primary full" disabled={busy}>
              保存套餐目录
            </button>
          </form>
        </Modal>
      )}
    </Shell>
  );
}
