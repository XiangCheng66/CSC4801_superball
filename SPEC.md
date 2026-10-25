# Project Specification — A / Day 1

## Product Scope

已实现项目骨架、两种角色的注册/登录/退出、当前账号查询、角色/所有权校验基础、公共请求/错误契约、数据库健康检查和认证演示账号。候选人技能与私有简历、公司、岗位、申请、匹配与面试业务尚未实现。

## Architecture

- React 19 + Vite：`frontend/`。`App.jsx` 恢复会话并切换认证表单与账号首页；`api/client.js` 封装统一 HTTP 调用。
- Django 5.2 + Django REST Framework：`backend/config` 为项目配置，`accounts` 为认证模块，`common` 为错误、会话认证、权限和健康检查。
- PostgreSQL 17 为应用数据库。默认单元测试为独立 SQLite 内存库，可用 `TEST_DATABASE_ENGINE=postgresql` 在独立 PostgreSQL 测试库运行相同测试。
- 本机 React 使用 Vite 的 `/api/` 代理；容器多阶段构建 React，Gunicorn/WhiteNoise 在同站点提供页面、静态文件与 API；数据库由 compose.yaml 的 PostgreSQL 服务提供。

## Data Model and Relationships

`accounts.User` 在初始迁移中替代默认 User，继承 Django `AbstractUser` 的密码哈希与会话支持。字段：唯一用户名、唯一邮箱、显示名称，以及只能为 `Candidate/Employer` 的 role。数据库使用 Lower 唯一约束实现用户名/邮箱不区分大小写唯一，并用 CHECK 约束限制角色。

用户名保存原拼写、登录不区分大小写；邮箱保存为小写。Django 数据库 Session 通过内置 session 表持久化。未来模块通过 `settings.AUTH_USER_MODEL` 建外键，不另建登录账号表，也不要迁移回默认 User。

`CompanyProfile/Job/RequiredSkill/Application` 已由 B 建立（迁移 `employers.0001`、`jobs.0001`、`applications.0001`），字段、约束与接入约定见 [EMPLOYER_DOMAIN_CONTRACT.md](docs/EMPLOYER_DOMAIN_CONTRACT.md)：

- `CompanyProfile` 以 `user_id` 为主键，一名雇主一份公司资料，含非空 `company_name` 与 `description`。
- `Job` 通过 `employer` 外键指向 `accounts.User`（不是 CompanyProfile），标题与描述非空；`RequiredSkill` 为子表，同一岗位内技能名不区分大小写唯一，岗位可以没有技能。
- `Application` 关联 `Job` 与候选人账号，`UNIQUE(job, candidate)` 阻止重复投递；`job` 外键使用 `PROTECT`，使带申请的岗位无法被删除并在接口层映射为 `409`；`status` 由 `CHECK` 约束限定为 `Pending/Interviewing/Rejected/Accepted`。

`CandidateProfile/InterviewSlot/Booking` 由 A/C 建立，其关系和迁移在实现时补充此处。

## Authentication and Authorization

- 注册使用 Django 密码校验和 `create_user/set_password`，数据库保存 PBKDF2-SHA256 盐化哈希。公开序列化器只输出 `id/username/email/display_name/role`。
- Django 数据库会话 + HttpOnly、SameSite=Lax Cookie。注册与登录成功后建立/轮换会话，退出在服务端使其失效。
- 注册/登录显式使用 CSRF 保护，认证后的写操作使用 SessionAuthentication 的 CSRF 校验。前端从当前 CSRF Cookie 生成 `X-CSRFToken`，不缓存登录前的令牌。
- 默认 API 要求登录；自定义 SessionAuthentication challenge 使匿名受保护请求返回 401，而不是 DRF SessionAuthentication 默认可能出现的 403。
- `common.permissions.IsCandidate/IsEmployer` 验证角色。`get_owned_object(queryset, user, owner_field=..., **lookup)` 验证身份后查找并检查所有权。先在 View 检查角色，再检查对象归属，区分 401/403/404。
- 账号所有权例子在 `/api/auth/users/<id>/`；`candidate/session` 和 `employer/session` 仅是角色校验基础，不替代未来业务接口。

## API Routes or Server Actions

完整请求字段、响应和错误约定见 [API_CONTRACT.md](docs/API_CONTRACT.md)。已实现：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health/` | 执行真实数据库 SELECT 1 |
| GET | `/api/auth/csrf/` | 初始化 CSRF Cookie |
| POST | `/api/auth/register/` | 创建账号并登录；201 |
| POST | `/api/auth/login/` | 登录；200 |
| POST | `/api/auth/logout/` | 退出；200 |
| GET | `/api/auth/me/` | 当前账号 |
| GET | `/api/auth/users/<id>/` | 仅本人账号 |
| GET | `/api/candidate/session/` | 求职者角色检查 |
| GET | `/api/employer/session/` | 雇主角色检查 |

成功包裹为 `data`；失败包裹为带 `code/message/fields?` 的 `error`。未知 API 路径在开发与非调试模式下均返回 JSON 404；路径需要末尾斜杠。

## User Interface and Workflows

响应式账号入口含登录和注册切换。注册可选择两种角色，成功后显示服务端返回的账号信息；账号首页可刷新数据库账号信息、验证角色权限、退出。页面重新加载会通过 `/api/auth/me/` 恢复会话。字段校验与网络失败有可读提示。

React 使用文本插值显示用户输入，不使用 `dangerouslySetInnerHTML`。手机布局有实际浏览器无横向溢出检查。尚无资料编辑、岗位、申请和预约页面。

## Matching Algorithm and Skill Storage

未实现，归 C。后续严格使用课程规定的技能归一化、重合比例与同分排序，双方共用一套后端函数；技能存储方案待与 A/B 确认。简历正文不参与规定分数。

## Interview Scheduling and Booking Transaction

未实现，归 C。后续需要未来 30 分钟时段、完整资格检查、数据库事务/约束、冲突 409 与 `Slot already booked`，并保留状态变化后的已有预约。不能使用进程内检查代替数据库原子性。

## Security Controls

严格注册/登录字段白名单，拒绝 `is_staff` 等未知字段；后端与数据库均限制角色。认证查询使用 ORM 绑定参数，并测试 SQL 元字符仍为绑定值。密码哈希、会话 ID 和内部权限字段不进入公开 JSON。

CSRF 对匿名登录/注册和登录后写操作均生效；退出后的旧 session 无法重用。调试外生产配置要求私有稳定 SECRET_KEY；HTTPS 环境需开启 Secure Cookie。未知错误只返回通用消息，数据库连接错误不向客户端回显。

`.env`、数据库文件、便携 PostgreSQL、日志、构建产物和浏览器截图均忽略。示例环境仅含占位值；公开演示账号明确为本地用途。单元测试不调用真实外部服务，业务占位测试标记为 skipped。

## Optional AI Features and Data Flow

未实现，无模型 API 调用、凭证或外部用户数据流。

## Design Decisions and Limitations

本次仅完成 A 的第一天基础任务。认证/公共权限不能证明未来岗位、简历或预约的授权已经实现；各模块仍须补充对象边界和具名测试。

数据库时刻采用 UTC（`USE_TZ=True`），预约展示时区由 C 在实现时明确。Docker/Compose 文件已建立，本机缺少 Docker，因此需要团队有 Docker 的机器补充容器构建证据。完整业务 seed 和 CI 由 B/C 后续完成。
