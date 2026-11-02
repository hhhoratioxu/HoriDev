# Cloudflare 部署

本项目部署为一个 Worker + Static Assets，同域提供 React 和 `/api/*`。后端使用 Workers Web API、Hono、D1 和 Drizzle，没有 VPS、系统进程或客户代码执行。

## 本地 D1

```sh
./horidev install --frozen-lockfile
./horidev setup
./horidev db:migrate
```

`setup` 已包含本地迁移，重复执行安全。D1 文件保存在 `.wrangler/state/`，不提交 Git。修改模型后用 `./horidev db:generate` 生成新迁移，再运行本地迁移。手工初始化套餐/预算 SQL 使用 INSERT OR IGNORE，不覆盖管理员已修改的设置。

## 生产资源（由运营方授权后执行）

```sh
./horidev exec wrangler login
./horidev exec wrangler d1 create horidev-production
```

将返回的真实 UUID 填入 `wrangler.jsonc` 的 `env.production.d1_databases[0].database_id`。保持 binding 为 `DB`。把 `env.production.vars.APP_URL` 改为你的真实 HTTPS Worker 域名或自定义域名，不能保留示例值。生产部署脚本会拦截示例域名/UUID。

```sh
./horidev exec wrangler d1 migrations apply DB --env production --remote
```

不要对生产迁移使用 `--local`。迁移前备份现有生产数据库，确认目标账号、数据库和环境。首次创建的数据库为空时无需导出旧数据。

## Secrets 与变量

| 名称                  | 位置                              | 用途                                        |
| --------------------- | --------------------------------- | ------------------------------------------- |
| BETTER_AUTH_SECRET    | Worker Secret，至少 32 个随机字符 | 会话与管理员 cookie 签名，所有实例保持一致  |
| OPENAI_API_KEY        | Worker Secret                     | 真实模型调用；Demo 不需要                   |
| ADMIN_USER_IDS        | Worker Secret，逗号分隔           | 可信管理员用户 ID 白名单                    |
| APP_ENV               | production vars                   | 必须 production，启用安全 Cookie 与生产限制 |
| APP_URL               | production vars                   | 真实 HTTPS 网站源，不含尾部斜杠             |
| AI_MODE               | production vars                   | demo 或 live                                |
| LIVE_CALLS_ENABLED    | production vars                   | true 才允许付费模型调用                     |
| OPENAI_MODEL_ECONOMY  | production vars                   | 默认 gpt-6-luna                             |
| OPENAI_MODEL_STANDARD | production vars                   | 默认 gpt-6.1-sol，仅复杂生成使用            |
| OPENAI_TIMEOUT_MS     | vars，可选                        | 默认 120000，最大 180000                    |
| ALLOW_REGISTRATION    | vars                              | 生产默认 false；受邀注册期间可短暂启用      |
| CONTACT_EMAIL         | vars，可选                        | 页脚的真实联系邮箱；未配置时不虚构地址      |
| DB                    | D1 binding                        | 业务与认证数据库                            |
| FILES                 | R2 binding，可选                  | 私有 ZIP 交付副本                           |
| ASSETS                | Static Assets binding             | 打包后的 React 与 Monaco 静态资源           |

```sh
./horidev exec wrangler secret put BETTER_AUTH_SECRET --env production
./horidev exec wrangler secret put OPENAI_API_KEY --env production
./horidev exec wrangler secret put ADMIN_USER_IDS --env production
```

密钥通过终端提示安全输入，不写入配置或命令行参数。不要把本地 `.dev.vars` 上传到 GitHub。生产与开发使用独立会话密钥、D1 数据库和 OpenAI 项目/密钥更便于核账。

首次管理员流程：运营方先短暂启用生产注册并创建自己的账号，通过自己的 `/api/me` 查看 user.id，设置 ADMIN_USER_IDS 后关闭注册，再访问 `/admin` 重新验证密码。不要仅根据未验证邮箱自动授予管理权限。

## 可选 R2

不启用 R2 时，文本源文件和版本保存在 D1，本地和生产均能导出 ZIP。启用 R2 后，导出将交付副本写入私有桶，返回给用户的内容仍经过账号和项目权限检查；不会生成公共桶地址。

```sh
./horidev exec wrangler r2 bucket create horidev-deliveries
```

在 `env.production` 添加：

```json
"r2_buckets": [{ "binding": "FILES", "bucket_name": "horidev-deliveries" }]
```

R2 可能需要开通账单，存储和操作有各自额度及费用，请先核对账号当前计划。建议配置 `exports/` 前缀的生命周期清理（例如 7 天）。R2 是交付副本，D1 版本记录仍须单独备份。仅本地测试 R2 可使用 Wrangler 的本地模拟，不必先购买资源。

当前没有 Turnstile 依赖。公开注册前建议集成服务端 Turnstile 校验与邮件验证；不可只在前端添加部件。

## 构建与部署

```sh
./horidev check
./horidev deploy
```

`check` 的 Workers 阶段是 dry-run，不创建云端资源。`deploy` 检查真实生产配置，然后构建前端并执行 `wrangler deploy --env production`。此动作会修改云端环境，应由运营方在授权后发起。

迁移和部署后，验证注册/登录、安全 cookie、两个账号的数据隔离、管理重新验证、真实模型权限、预算阻止、SSE 断线与文件下载。开启 Live 也必须逐单人工授权。没有真实执行服务时继续保留测试/构建“未启用”标签。

## GitHub

源码仓库为 [hhhoratioxu/HoriDev](https://github.com/hhhoratioxu/HoriDev)。可以直接克隆，或 Fork 到自己的账号后配置部署。不要上传 `.dev.vars`、`.wrangler/`、`node_modules/` 或本地账号数据；其他环境应自行创建私有配置和密钥。

`ci.yml` 对推送与 PR 执行类型、风格、格式、模拟测试、构建；`deploy.yml` 仅支持 workflow_dispatch。先在仓库的 production Environment 设置审批保护和最小权限 Cloudflare API Token，然后配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` Secrets。OpenAI 和会话密钥应已通过 Wrangler 存在 Worker Secrets 中，不需要进入构建阶段。

生产工作流会先远程应用迁移再部署。务必先替换 production 中的示例 UUID 与域名。源码推送仅触发检查，不自动部署。云端 CI 和部署只有实际执行后才算验证，当前本地成功不能证明云端已上线。

## 地区、政策和费用

账号及实际使用场所必须符合 [OpenAI 支持地区](https://developers.openai.com/api/docs/supported-countries) 和 Cloudflare 当前政策。不能通过改换部署区域来假定规避服务限制。创建免费账户不等于所有资源永久免费；Workers CPU、D1 读写/容量、R2 存储和操作分别计费。密码哈希和 ZIP 的 CPU 需要云端实测。[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)、[Cloudflare 价格](https://developers.cloudflare.com/workers/platform/pricing/)。
