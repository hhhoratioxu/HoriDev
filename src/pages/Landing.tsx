import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Terminal,
  Globe2,
  Bug,
  Braces,
  Database,
  Layers3,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  Play,
  ShieldCheck,
  Download,
  CircleDot,
  Zap,
  LockKeyhole,
} from 'lucide-react';
import { Navbar, Logo, Spinner, ErrorBox } from '../components/ui';
import { useAuth } from '../lib/context';
import { serviceOptions } from '../../shared/contracts';
const icons = {
  terminal: Terminal,
  globe: Globe2,
  bug: Bug,
  braces: Braces,
  database: Database,
  layers: Layers3,
};
const examples = {
  python: {
    name: 'main.py',
    language: 'Python',
    prompt: '帮我写一个按日期分类 Excel 的工具',
    lines: [
      'from pathlib import Path',
      'import pandas as pd',
      '',
      'def organize_by_date(source: Path):',
      '    data = pd.read_excel(source)',
      '    dates = pd.to_datetime(data["日期"])',
      '',
      '    for month, rows in data.groupby(',
      '        dates.dt.strftime("%Y-%m")',
      '    ):',
      '        rows.to_excel(f"{month}.xlsx", index=False)',
      '',
      '# 让重复工作，自动完成。',
    ],
  },
  web: {
    name: 'App.tsx',
    language: 'React',
    prompt: '我想做一个简洁的个人作品集网站',
    lines: [
      'import { motion } from "motion/react";',
      '',
      'export default function Portfolio() {',
      '  return (',
      '    <main className="canvas">',
      '      <motion.h1 animate={{ opacity: 1 }}>',
      '        Hello, possibilities.',
      '      </motion.h1>',
      '      <p>为每一个好想法，留出空间。</p>',
      '    </main>',
      '  );',
      '}',
      '// 从想象，抵达屏幕。',
    ],
  },
  api: {
    name: 'api.ts',
    language: 'TypeScript',
    prompt: '创建一个带输入校验的 API 接口',
    lines: [
      'import { Hono } from "hono";',
      'import { z } from "zod";',
      '',
      'const app = new Hono();',
      '',
      'app.post("/ideas", async (context) => {',
      '  const idea = z.object({',
      '    title: z.string().min(1),',
      '  }).parse(await context.req.json());',
      '',
      '  return context.json({ idea }, 201);',
      '});',
      '// 让系统之间，自由对话。',
    ],
  },
};
function ProductPreview() {
  const [active, setActive] = useState<keyof typeof examples>('python');
  const sample = examples[active];
  return (
    <div className="product-preview glass">
      <div className="preview-window-top">
        <div className="traffic-lights">
          <i />
          <i />
          <i />
        </div>
        <span>
          <LockKeyhole size={11} /> HoriDev Workspace
        </span>
        <span className="preview-demo-label">产品界面示意</span>
      </div>
      <div className="preview-body">
        <aside className="preview-filetree">
          <span>EXPLORER</span>
          <b>
            <ChevronDown size={12} /> my-next-idea
          </b>
          {Object.entries(examples).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setActive(key as keyof typeof examples)}
              className={active === key ? 'active' : ''}
            >
              <FileCode2 size={14} />
              {item.name}
            </button>
          ))}
          <div className="preview-tree-bottom">
            <CircleDot size={13} /> 所有可能，即刻开始
          </div>
        </aside>
        <div className="preview-editor">
          <div className="preview-tab">
            <FileCode2 size={13} />
            {sample.name}
            <span>×</span>
          </div>
          <div className="preview-code">
            {sample.lines.map((line, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, ' ')}</span>
                <code
                  className={
                    line.startsWith('#') || line.startsWith('//')
                      ? 'comment'
                      : line.includes('import') || line.includes('from')
                        ? 'keyword'
                        : ''
                  }
                >
                  {line || ' '}
                </code>
              </div>
            ))}
          </div>
          <div className="preview-status">
            <Code2 size={11} /> {sample.language}
            <span>UTF-8</span>
          </div>
        </div>
        <aside className="preview-assistant">
          <div>
            <Sparkles size={16} />
            <b>HoriDev AI</b>
            <span className="tiny-tag">示例</span>
          </div>
          <div className="preview-user-bubble">{sample.prompt}</div>
          <div className="preview-ai-message">
            <span className="mini-ai">✦</span>
            <p>
              好的，让我们把想法变成代码。
              <br />
              <br />
              先确认需求，再开始创造。
            </p>
          </div>
          <div className="preview-delivery">
            <span>
              <FileCode2 size={15} />
              {sample.name}
            </span>
            <span>
              <FileCode2 size={15} />
              README.md
            </span>
          </div>
          <div className="preview-composer">
            描述你想实现的功能…
            <ArrowRight size={14} />
          </div>
        </aside>
      </div>
    </div>
  );
}
export function PlanCards() {
  const { config, error, refresh, me } = useAuth();
  if (error) return <ErrorBox message={error} retry={() => void refresh()} />;
  if (!config) return <Spinner label="正在获取套餐…" />;
  return (
    <div className="pricing-grid">
      {config.plans.map((plan) => (
        <article
          className={`pricing-card glass ${plan.highlighted ? 'highlighted' : ''}`}
          key={plan.id}
        >
          {plan.highlighted && <span className="recommended">更多创造空间</span>}
          <span className="plan-name">{plan.name}</span>
          <p>{plan.description}</p>
          <h3>{plan.priceLabel}</h3>
          <small>{plan.id === 'free' ? '体验完整交付流程' : '价格与额度在范围确认后核定'}</small>
          <Link
            to={me ? '/dashboard' : '/register'}
            className={`button full ${plan.highlighted ? 'primary' : 'secondary'}`}
          >
            {plan.id === 'free' ? '开始体验' : '提交需求'}
            <ArrowUpRight size={15} />
          </Link>
          <ul>
            {plan.features.map((f) => (
              <li key={f}>
                <Check size={15} />
                {f}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
export function Footer() {
  const { config } = useAuth();
  return (
    <footer className="site-footer">
      <div>
        <Logo />
        <p>描述你的想法，让 AI 帮你实现。</p>
      </div>
      <div>
        <Link to="/pricing">价格方案</Link>
        <Link to="/dashboard">工作台</Link>
        {config?.contact ? (
          <a href={`mailto:${config.contact}`}>
            联系 HoriDev <ArrowUpRight size={12} />
          </a>
        ) : (
          <a href="/#faq">服务说明</a>
        )}
      </div>
      <small>© {new Date().getFullYear()} HoriDev. Made for your next idea.</small>
    </footer>
  );
}
export function Landing() {
  const { me, config } = useAuth();
  const start = me ? '/dashboard' : '/register';
  return (
    <div className="marketing-page">
      <a href="#main" className="skip-link">
        跳到主要内容
      </a>
      <Navbar />
      <main id="main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-ambient ambient-one" />
          <div className="hero-ambient ambient-two" />
          <div className="hero-copy">
            <span className="hero-pill">
              <span className="pill-dot" /> 从想法到软件，一次全新的创造方式{' '}
              <ArrowUpRight size={13} />
            </span>
            <h1>
              想法已就绪。
              <br />
              <span>让创造，自然发生。</span>
            </h1>
            <p>
              描述你的想法，让 AI 帮你实现。
              <br className="desktop-break" />
              从自动化脚本到完整网站，把灵感变成触手可及的作品。
            </p>
            <div className="hero-actions">
              <Link to={start} className="button primary large">
                开始创建 <ArrowRight size={18} />
              </Link>
              <a href="#workspace-preview" className="button secondary large">
                <Play size={15} fill="currentColor" /> 探索工作空间
              </a>
            </div>
            <div className="hero-assurances">
              <span>
                <Check size={13} /> 源码完整交付
              </span>
              <span>
                <Check size={13} /> 费用清晰可控
              </span>
              <span>
                <Check size={13} /> 创造由你掌握
              </span>
            </div>
          </div>
          <div id="workspace-preview" className="hero-product">
            <div className="floating-note">
              <span className="sparkle-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <b>你的下一件作品</b>
                <span>从一句话开始。</span>
              </div>
            </div>
            <ProductPreview />
            <div className="product-caption">
              <span className="line" /> YOUR IDEAS. BEAUTIFULLY BUILT. <span className="line" />
            </div>
          </div>
        </section>
        <section id="services" className="section services-section">
          <div className="section-top">
            <div>
              <span className="eyebrow">BUILT AROUND YOUR IDEAS</span>
              <h2>
                不止一种想法。
                <br />
                不止一种可能。
              </h2>
            </div>
            <p>
              把琐事交给自动化，把时间留给创造。
              <br />
              从一个小工具，开始你的下一个大想法。
            </p>
          </div>
          <div className="services-grid">
            {serviceOptions.map((s, i) => {
              const Icon = icons[s.icon];
              return (
                <Link
                  to={`${start}${me ? '' : `?service=${s.id}`}`}
                  className="service-card glass"
                  key={s.id}
                >
                  <span className={`service-icon tone-${i}`}>
                    <Icon size={24} />
                  </span>
                  <span className="service-number">0{i + 1}</span>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <span className="service-link">
                    开始探索 <ArrowUpRight size={15} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
        <section id="workflow" className="section workflow-section">
          <div className="section-centered">
            <span className="eyebrow">FROM A SPARK TO SOMETHING REAL</span>
            <h2>好想法，只需要一个开始。</h2>
            <p>每一步清晰可见，每一次创造由你决定。</p>
          </div>
          <div className="workflow-grid">
            {[
              {
                n: '01',
                title: '说出你的想法',
                text: '用自然语言描述需求。告诉我们你想解决什么问题，剩下的交给 HoriDev。',
                icon: Sparkles,
              },
              {
                n: '02',
                title: '一起确认方向',
                text: 'AI 梳理需求与实现方案。确认范围和资源授权后，再迈出下一步。',
                icon: CircleDot,
              },
              {
                n: '03',
                title: '看见创造发生',
                text: '代码在专属工作区生成，逐个文件查看、编辑、比较，保留每一次迭代。',
                icon: Code2,
              },
              {
                n: '04',
                title: '带走你的作品',
                text: '完整源码、README 和使用说明，一键打包。你的作品，始终由你掌握。',
                icon: Download,
              },
            ].map((item) => (
              <article key={item.n}>
                <div className="workflow-icon">
                  <item.icon size={22} />
                  <span>{item.n}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <div className="honest-note glass">
            <ShieldCheck size={22} />
            <div>
              <b>清晰的边界，让创造更安心。</b>
              <p>
                首版提供代码生成与 AI 静态审查。运行和自动化测试尚未启用，所有演示内容均明确标注。
              </p>
            </div>
          </div>
        </section>
        <section className="section pricing-section">
          <div className="section-centered">
            <span className="eyebrow">ROOM FOR EVERY AMBITION</span>
            <h2>让每一个想法，都有开始的空间。</h2>
            <p>从免费演示开始。真实开发按任务或项目评估，首版采用人工报价与资源确认。</p>
          </div>
          <PlanCards />
          <p className="pricing-note">
            首版暂未接入在线支付。套餐为服务目录，不会自动扣款或授予付费调用额度。
          </p>
        </section>
        <section id="faq" className="section faq-section">
          <div>
            <span className="eyebrow">A LITTLE MORE CLARITY</span>
            <h2>好奇，很自然。</h2>
            <p>开始创造前，你可能想知道。</p>
          </div>
          <div className="faq-list">
            {[
              {
                q: '没有编程经验，也可以使用吗？',
                a: '可以。用自然语言描述问题，AI 会给出方案和使用说明。生成的软件仍需要在适合的环境中验证；复杂部署和维护建议由有经验的开发者协助。',
              },
              {
                q: '免费演示会消耗我的 OpenAI 额度吗？',
                a: '不会。Demo 模式使用明确标注的预置示例，没有真实模型调用，也不记录虚假的 Token 消耗。切换 Live 后需运营方开启调用并确认订单授权。',
              },
              {
                q: '代码和项目可以下载吗？',
                a: '可以。工作区支持逐文件查看、编辑、版本比较和单文件下载，也可将当前项目完整打包为 ZIP。',
              },
              {
                q: '生成的代码通过了真实测试吗？',
                a: '首版没有隔离代码执行环境，因此不会运行客户程序。AI 静态审查和真正的程序测试会分别标注；平台不会伪造测试通过结果。',
              },
              {
                q: '如何控制开发成本？',
                a: '平台在每次真实调用前检查用户、任务和平台预算并预留额度。官方 usage 用于记录 Token，配置的模型价格用于估算费用。估算与 OpenAI 最终账单可能存在差异。',
              },
              {
                q: '我的项目是私有的吗？',
                a: '项目和文件 API 会在服务端验证会话与所属用户。项目内容只发送到你启用的模型服务；请勿上传密钥、个人敏感数据或未经授权的代码。',
              },
            ].map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <ChevronDown size={17} />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta section">
          <div className="cta-orb" />
          <span className="eyebrow">THE NEXT THING STARTS WITH YOU</span>
          <h2>
            那个想了很久的点子。
            <br />
            <span>现在，就让它发生。</span>
          </h2>
          <Link to={start} className="button primary large">
            开始我的第一个项目 <ArrowRight size={18} />
          </Link>
          <p>
            <Zap size={13} />
            {config?.mode === 'live'
              ? 'Live 模式 · 资源授权后开始'
              : '演示模式已就绪 · 无需配置 API 即可体验'}
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
export function Pricing() {
  return (
    <div className="marketing-page">
      <Navbar />
      <main className="pricing-page section">
        <div className="section-centered">
          <span className="eyebrow">SIMPLE. THOUGHTFUL. FLEXIBLE.</span>
          <h1>给创造，多一点空间。</h1>
          <p>先确认你需要什么，再决定如何开始。</p>
        </div>
        <PlanCards />
        <div className="honest-note glass">
          <ShieldCheck size={23} />
          <div>
            <b>没有隐藏扣款，也没有虚假付款。</b>
            <p>
              Free 仅为预置演示。Starter、Pro、Custom 的价格和额度由人工确认，当前没有在线支付。AI
              静态审查不等于执行测试通过。
            </p>
          </div>
        </div>
        <Link className="text-link" to="/">
          返回首页 <ArrowRight size={14} />
        </Link>
      </main>
      <Footer />
    </div>
  );
}
