# API 与状态约定

所有接口位于 `/api`。除 config、health 和 Better Auth 入口外均需安全会话。写接口要求同源 Origin 与 application/json。普通用户不能调用管理员接口。

## 用户与项目

| 方法 / 路径                                 | 行为                                         |
| ------------------------------------------- | -------------------------------------------- |
| GET /config                                 | 模式、服务可用性、套餐与存储说明，不返回密钥 |
| GET /health                                 | 应用健康与 execution:false                   |
| POST /auth/sign-up/email                    | Better Auth 注册（生产默认关闭）             |
| POST /auth/sign-in/email                    | 登录                                         |
| POST /auth/sign-out                         | 撤销会话                                     |
| POST /auth/change-password                  | 更改密码，可撤销其他会话                     |
| GET/PATCH /me                               | 当前账号、用量、额度 / 修改显示名称          |
| GET/POST /projects                          | 个人项目列表 / 创建                          |
| GET/DELETE /projects/:id                    | 项目详情 / 删除无真实计费记录的项目          |
| GET/POST /projects/:id/files                | 全部文件版本 / 比较 baseVersion 后保存新版本 |
| GET /projects/:id/download?path=…&version=… | 下载指定文件版本，缺省当前版本               |
| GET /projects/:id/export                    | 打包当前版本，附交付边界说明                 |

文件 POST：`{path,content,language,baseVersion}`。新文件 baseVersion 为 0。冲突返回 409；历史版本的恢复也是一次新版本写入，不删除旧记录。

## 任务

| 方法 / 路径             | 行为                                              |
| ----------------------- | ------------------------------------------------- |
| GET /tasks?projectId=…  | 个人最近最多 100 个任务，可按项目筛选             |
| POST /tasks             | `{projectId,prompt,title?}` 创建任务与订单        |
| GET /tasks/:id          | 任务、消息、文件版本、事件、用量、订单和执行边界  |
| PATCH /tasks/:id        | `{prompt}` 修改需求，重置方案并撤销 Live 人工授权 |
| POST /tasks/:id/run     | `{stage:analyze/generate/review}`，返回 SSE       |
| POST /tasks/:id/confirm | `{scopeVersion}` 确认当前分析版本                 |
| POST /tasks/:id/cancel  | 取消，未知消耗继续预留                            |
| POST /tasks/:id/recover | 恢复停滞超过 4 分钟的运行状态                     |

基本路径：draft → analyzing → awaiting_confirmation → ready → generating → ready → reviewing → completed。生成后可直接导出；completed 表示源码交付和 AI 静态审查完成，不表示执行或自动化测试通过。任何阶段可失败；未完成任务可取消。失败重试受次数和预算约束。

SSE 事件：status（阶段）、delta（未经完整结构验证的 JSON 片段）、complete（已验证并保存）、error（明确分类）。客户端不得在 delta 阶段声称交付完成。连接断开且没有 complete/error 应显示中断并重新读取任务状态。

## 管理员

服务端 ADMIN_USER_IDS 白名单 + 已登录会话是先决条件。POST /admin/unlock `{password}` 再次验证密码，签发绑定登录会话的 15 分钟管理员 Cookie。后续操作还需此 Cookie。

| 方法 / 路径                     | 行为                                               |
| ------------------------------- | -------------------------------------------------- |
| POST /admin/lock                | 清除管理会话                                       |
| GET /admin/overview             | 用户、任务、真实用量、预算、趋势、异常与审计       |
| PUT /admin/settings             | 经 settingsSchema 校验的完整预算/开关/模型价格     |
| PUT /admin/quotas/:userId       | `{limitUsd}` 设置用户累计额度                      |
| PUT /admin/plans/:id            | 更新套餐目录                                       |
| POST /admin/orders/:id/approve  | `{quoteCents,acknowledge:true}` 一次性人工资源授权 |
| POST /admin/usage/:id/reconcile | `{costMicros,note}` 核对 uncertain 记录            |

人工确认只对 awaiting_quote/draft/awaiting_payment 的订单生效，条件更新防止重复授权。首版不提供付款/扣费接口。

## 错误

业务接口返回：

```json
{ "error": { "code": "SCOPE_CONFLICT", "message": "任务范围已更改或尚未分析。", "requestId": "…" } }
```

Better Auth 入口保持认证库的 `{code,message}` 格式，由统一前端客户端兼容。常见状态：401 未登录，403 来源/权限/管理重新验证失败，404 不存在或不属于当前用户，409 状态/版本竞争，413 内容上限，422 结构校验，429 频率/预算/并发上限，502 上游模型问题，503 配置或平台开关未就绪。

错误日志不记录需求、源码、密码或明文密钥。UI 与日志使用 requestId 关联；实际模型响应 ID 记录于 usage_records。
