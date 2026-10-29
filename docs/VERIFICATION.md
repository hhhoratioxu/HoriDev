# 本地验收记录

日期：2026-10-29（Asia/Taipei）。设备：当前 macOS Apple Silicon 开发机。以下结果只代表明确列出的环境，不能替代真实云端、公开用户负载或客户程序的运行验收。

## 已完成的验证

| 项目              | 结果与范围                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 严格 TypeScript   | 本地检查通过；TS 6.0.3                                                                                        |
| ESLint            | 本地检查通过；不使用 any 绕过类型检查                                                                         |
| Prettier          | 源码与文档格式检查通过                                                                                        |
| 单元/API/SDK 模拟 | 44 项通过；真实本地 Miniflare D1，模型传输为模拟，不消耗 API                                                  |
| Chromium 用户流程 | 注册 → 创建项目 → 分析 → 范围确认 → 代码生成 → 静态审查 → Monaco 实际键盘编辑 → 保存 v2 → Diff → ZIP 下载通过 |
| WebKit 用户流程   | 同上通过，使用 Playwright WebKit 引擎；不是在用户的原生 Safari 应用内验收                                     |
| 手机与键盘        | Chromium、WebKit 的 390×844 首页无横向溢出，减少动态效果设置及键盘跳转通过；Chromium 手机工作区通过           |
| 前端构建          | Vite 本地 production build 通过，Monaco 与所有编辑器 Worker 自托管                                            |
| Workers 打包      | Wrangler dry-run 通过，不创建或修改 Cloudflare 云端资源                                                       |
| 本地 D1 迁移      | 首次初始化与增量价格快照迁移均已实际应用                                                                      |
| 管理后台浏览器    | Chromium + 真实本地 Workers/D1 下通过密码重新验证、统计、用户表和预算保存；临时管理员账号已确认清理为零       |
| 真实 OpenAI       | 经用户授权完成一次独立的本地 Workers/D1 验收，三个 Responses 阶段成功，结果已保存为 ZIP                       |
| ZIP 完整性        | 真实 API 交付 ZIP 的 3 个条目均通过 CRC 检查                                                                  |
| 密钥保护          | .dev.vars 0600，Git 忽略；前端和交付源码不包含真实密钥                                                        |

## 真实 API 验收明细

验收需求：Python UTF-8 文本非空行计数工具，交付 main.py 与 README.md。任务在独立的临时 D1 中创建，订单由已获授权的验收脚本设置为人工资源授权状态；没有支付行为。平台阶段上限为 3 次，内部预算硬上限 $0.09。没有运行生成的 Python 程序。

| 阶段     | 模型       | 输入 Tokens | 输出 Tokens | 缓存输入 | 配置价格估算 USD |
| -------- | ---------- | ----------: | ----------: | -------: | ---------------: |
| 分析     | gpt-6-luna |         387 |         283 |        0 |         0.000181 |
| 生成     | gpt-6-luna |         647 |         557 |        0 |         0.000344 |
| 静态审查 | gpt-6-luna |        1197 |         228 |        0 |         0.000234 |
| 合计     |            |        2231 |        1068 |        0 |     **0.000759** |

这些 Token 均来自官方 Responses 返回的 usage。金额为按快照配置价格向上取整的应用估算，未读取 OpenAI 最终账单。没有未知预留残留。真实响应 ID、阶段状态和完整记录见 [live-smoke-report.json](../artifacts/live-smoke-report.json)。源码交付见本地 `artifacts/live-delivery.zip`（被 Git 忽略）。

真实验收使用独立临时账本；主本地 Demo 数据库不会因此显示真实调用。投入运营前应按整个 OpenAI 项目的实际账单校准预算，不能把新应用账本当作账号余额。

## 自动化测试覆盖

- 文件：相对路径、穿越、控制字符、敏感路径、扩展名、UTF-8 字节大小、文件数量、大小写重复路径、历史版本选择与 ZIP 原文。
- 认证与权限：注册/会话、未登录访问、来源验证、两个真实测试账号间项目/任务/文件/下载/导出隔离、管理白名单及密码重新验证。
- 任务：完整 SSE Demo 流程、范围确认、重复认领、取消后不提交文件、调用次数上限、Demo/Live 隔离、修改范围与撤销订单授权的原子批处理。
- 用量：平台并发预留、用户/任务额度、独立平台硬预算、未知用量保留、价格快照、官方 usage 结算、结构无效仍记录费用、重复人工订单确认的状态竞争。
- SDK：结构化 schema 与 store:false、完成 usage、截断 usage、缺少 usage 的失败、429 有限重试、400 不支持参数时停止。

## 可复查的产物

- `artifacts/landing-hero.png`、`landing-desktop.png`、`landing-mobile.png`：本地浏览器实际渲染。
- `artifacts/workspace-desktop.png`、`workspace-mobile.png`：实际登录后的演示项目与真实本地 D1 数据。
- `artifacts/admin-desktop.png`、`admin-ui-report.json`：真实本地管理后台与验收结果。图中的用户和任务来自本地 QA，不代表公开客户或线上业绩。
- `artifacts/live-smoke-report.json`：唯一一次获授权真实模型验收记录。
- `test-results/e2e-results.json`：Playwright 最近一次执行的详细结果（测试目录不进入 Git）。

## 仍未验证或未接入

- gpt-6.1-sol 的账号访问权限与复杂任务质量尚未实际调用验证。
- 没有部署 Cloudflare 生产 Worker、远程 D1 或 R2；没有 GitHub 远程推送、CI 执行或云端负载测试。
- 没有原生 Safari/Chrome 人工完整验收，只有上述浏览器引擎自动化。
- 没有在线支付、邮件发送/找回/验证、Turnstile、MFA 或隔离代码执行服务。
- AI 审查仅为静态模型输出，既不证明语法正确，也不证明程序运行和测试通过。
- 密码哈希在本地运行成功，但 Workers 免费计划 CPU 的适配性需要部署后实测。

## 重新运行

`./horidev setup` 已实际复跑，确认无剩余迁移；`./horidev dev` 已启动 Vite 5173 与本地 Worker 8787，5173 的同域 `/api/health` 返回正常。验收结束后两个本地服务已停止。

`./horidev deploy` 在当前示例生产配置下按预期拒绝，明确要求先填写域名与 D1 ID，没有联系 Cloudflare 创建或修改资源。

```sh
./horidev typecheck
./horidev lint
./horidev format:check
./horidev test
./horidev build
./horidev test:e2e
```

真实 API 脚本不会包含在自动化 check/CI 中。每次再次运行都会产生新的真实消耗，需要运营方另行授权，并确认剩余预算：

```sh
./horidev test:live --allow-paid-api
```

浏览器验收会创建 `.example.test` 邮箱的本地测试账号与演示项目，这些数据仅保留在被 Git 忽略的本地 D1 中，不会同步到生产。

管理员浏览器验收可在 8787 端口空闲时运行 `./horidev exec node scripts/admin-ui-smoke.mjs`。脚本只允许 development + demo，临时创建账号并授予本地白名单权限，重启自己启动的 Worker，完成验证后恢复私有配置并删除临时账号。
