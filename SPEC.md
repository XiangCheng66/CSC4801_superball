# Project Specification — A/B/C Day 2

## Product Scope

已实现账号、求职者资料/私有简历/全部岗位推荐、公司资料、雇主岗位 CRUD 与未来时段管理。三个模块在同一 Django 应用和按角色分配的 React 工作台集成。投递、申请人状态管理、候选人预约与冲突处理仍待实现。

## Architecture

- React 19 + Vite：`frontend/`。`App.jsx` 恢复会话并切换认证表单与账号首页；`api/client.js` 封装统一 HTTP 调用。
- Django 5.2 + Django REST Framework：`backend/config` 为项目配置，`accounts` 为认证模块，`common` 为错误、会话认证、权限和健康检查。
- `backend/matching` 为 Django 业务模块可直接导入的无状态计算服务，无模型/迁移/独立路由；A/B 负责授权查询和响应序列化，C 统一计算分数和排序。
- PostgreSQL 17 为应用数据库。默认单元测试为独立 SQLite 内存库，可用 `TEST_DATABASE_ENGINE=postgresql` 在独立 PostgreSQL 测试库运行相同测试。
- 本机 React 使用 Vite 的 `/api/` 代理；容器多阶段构建 React，Gunicorn/WhiteNoise 在同站点提供页面、静态文件与 API；数据库由 compose.yaml 的 PostgreSQL 服务提供。

## Data Model and Relationships

`accounts.User` 在初始迁移中替代默认 User，继承 Django `AbstractUser` 的密码哈希与会话支持。字段：唯一用户名、唯一邮箱、显示名称，以及只能为 `Candidate/Employer` 的 role。数据库使用 Lower 唯一约束实现用户名/邮箱不区分大小写唯一，并用 CHECK 约束限制角色。

用户名保存原拼写、登录不区分大小写；邮箱保存为小写。Django 数据库 Session 通过内置 session 表持久化。未来模块通过 `settings.AUTH_USER_MODEL` 建外键，不另建登录账号表，也不要迁移回默认 User。

`CompanyProfile/Job/RequiredSkill/Application` 已由 B 建立（迁移 `employers.0001`、`jobs.0001`、`applications.0001`），字段、约束与接入约定见 [EMPLOYER_DOMAIN_CONTRACT.md](docs/EMPLOYER_DOMAIN_CONTRACT.md)：

- `CompanyProfile` 以 `user_id` 为主键，一名雇主一份公司资料，含非空 `company_name` 与 `description`。
- `Job` 通过 `employer` 外键指向 `accounts.User`（不是 CompanyProfile），标题与描述非空；`RequiredSkill` 为子表，同一岗位内技能名不区分大小写唯一，岗位可以没有技能。
- `Application` 关联 `Job` 与候选人账号，`UNIQUE(job, candidate)` 阻止重复投递；`job` 外键使用 `PROTECT`，使带申请的岗位无法被删除并在接口层映射为 `409`；`status` 由 `CHECK` 约束限定为 `Pending/Interviewing/Rejected/Accepted`。

`candidates.CandidateProfile` 以 User ID 为主键，保存技能 JSON、私有 resume_text 与时间戳，显示名仍在 User。旧账号 GET 返回空资料，首次 PUT 创建记录；两写接口锁 User 并只更新各自字段。`scheduling.InterviewSlot` 关联 Job（PROTECT），数据库 CHECK 限制恰好 30 分钟；所有者由 job.employer 派生。最小 Booking 的 slot/application 分别 OneToOne+PROTECT，仅实现存储和保护，完整预约服务尚未实现。

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
| GET/PUT | `/api/candidate/profile/` | 本人显示名与技能 |
| GET/PUT | `/api/candidate/profiles/<user_id>/` | 仅本人可访问的显式 ID 别名 |
| GET/PUT | `/api/candidate/resume/` | 本人私有简历原文 |
| GET/PUT | `/api/candidate/resumes/<user_id>/` | 仅本人可访问的显式 ID 别名 |
| GET | `/api/candidate/recommendations/` | 全部岗位与共享匹配排序 |
| GET/PUT | `/api/employer/company/` | 本人公司资料；首次 GET 为 404，PUT 新建 201/更新 200 |
| GET/POST | `/api/employer/jobs/` | 本人岗位列表/创建 |
| GET/PATCH/DELETE | `/api/employer/jobs/<id>/` | 所有权、部分更新、关联申请或时段时删除 409 |
| GET | `/api/employer/jobs/<id>/applicants/` | 岗位申请人：身份、技能、匹配分、状态、预约；按匹配分降序 |
| PATCH | `/api/employer/applications/<id>/status/` | 四态状态修改；仅岗位所有者，非所有者 403 |
| GET/POST | `/api/slots/` | 本人时段列表/未来 30 分钟创建 |
| GET | `/api/slots/jobs/` | 本人岗位选项 |
| GET/DELETE | `/api/slots/<id>/` | 本人时段；已预约或已开始不能删除 |

字段与严格输入校验见 [CANDIDATE_CONTRACT.md](docs/CANDIDATE_CONTRACT.md)。所有求职者接口先检查认证/角色，ID 别名再查用户和所有权，分别返回 401/403/404；简历仅在本人简历接口返回。资料、公开账号和推荐均不包含简历。

成功包裹为 `data`；失败包裹为带 `code/message/fields?` 的 `error`。未知 API 路径在开发与非调试模式下均返回 JSON 404；路径需要末尾斜杠。

## User Interface and Workflows

响应式账号入口含登录和注册切换。注册可选择两种角色，成功后显示服务端返回的账号信息；账号首页可刷新数据库账号信息、验证角色权限、退出。页面重新加载会通过 `/api/auth/me/` 恢复会话。字段校验与网络失败有可读提示。

React 使用文本插值，不使用 dangerouslySetInnerHTML。Candidate 工作台保留账号操作，提供资料/私有简历与推荐。EmployerDashboard 统一显示账号、B 的公司/岗位和 C 的 AvailabilityPanel；成功修改岗位后通过 revision 自动刷新时段选择项。隔离雇主岗位 CSS，避免覆盖求职者列表。手机布局有浏览器检查。

雇主在自己的岗位下点"申请人"展开面板：每行显示候选人显示名、技能、匹配分、申请状态与已预约的面试时间（北京时间），状态下拉可在 `Pending/Interviewing/Rejected/Accepted` 间修改，失败时保留原值并提示。面板只显示公开字段，简历、邮箱与密码哈希不进入该响应。

## Matching Algorithm and Skill Storage

已实现 `backend/matching/services.py` 的 `normalize_skills`、`calculate_match_score`，以及 `ranking.py` 的 `rank_jobs`、`rank_applicants`，统一从 `matching` 导入。接口字段与可执行调用示例见 [共享匹配契约](docs/MATCHING_CONTRACT.md)。

技能输入为字符串列表，归一化为去首尾空格、转小写、去空值和去重的集合 C/R。R 为空时得分 100，否则用整数运算 `100 * len(C & R) // len(R)` 向下取整；简历不是评分参数。非法技能类型抛出 TypeError，HTTP 层须先用 serializer 验证。

岗位技能由 B 的 RequiredSkill 子表保存，Job.required_skill_names 转换为列表；查询推荐时预取 required_skills。求职者技能由 CandidateProfile.skills JSONField 保存：API 严格接收字符串数组，strip/lower/去空值/去重/排序，单项去首尾空白后的输入及规范化结果不超过 100 字符。无资料时按空技能计算；matching 只接收内存集合，不直接读库。

两端评分调用同一函数。职位排序按分数降序、标题 casefold、整数职位 ID；申请人排序按分数降序、显示名 casefold、整数求职者 User ID（不是申请 ID）。返回新列表和浅拷贝行，保留其他字段并覆盖旧分数，不修改输入。A 负责提供全部当前职位；B 负责提供已授权职位的申请人；调用方负责筛选公开输出字段，严禁泄露简历。

A 的 RecommendationsView 查询全部实际存在的 Job，预加载雇主公司与岗位技能，再调用 rank_jobs，不分页、不丢弃零分岗位。公司不存在时使用雇主显示名，再回退用户名。响应字段白名单见求职者契约。seed_candidate_demo 的三个候选人与两个岗位覆盖 100/50/0/空要求 100；B 的申请人接口与完整业务重置仍待补。

## Interview Scheduling and Booking Transaction

C 已实现雇主时段列表、未来 30 分钟创建、仅本人删除、已预约/已开始删除拒绝与可用筛选。API 接受明确时区、输出 UTC，UI 固定 Asia/Shanghai。创建事务锁 Job，删除锁 InterviewSlot；真实时段使 B 的岗位删除返回 409。Booking 目前仅提供存储和约束；FP-SCHED-2/3 的完整资格、预约入口与原子竞争仍待实现。

## Security Controls

严格注册/登录字段白名单，拒绝 `is_staff` 等未知字段；后端与数据库均限制角色。认证查询使用 ORM 绑定参数，并测试 SQL 元字符仍为绑定值。密码哈希、会话 ID 和内部权限字段不进入公开 JSON。

CSRF 对匿名登录/注册和登录后写操作均生效；退出后的旧 session 无法重用。调试外生产配置要求私有稳定 SECRET_KEY；HTTPS 环境需开启 Secure Cookie。未知错误只返回通用消息，数据库连接错误不向客户端回显。

`.env`、数据库文件、便携 PostgreSQL、日志、构建产物和浏览器截图均忽略。示例环境仅含占位值；公开演示账号明确为本地用途。单元测试不调用真实外部服务，业务占位测试标记为 skipped。

## Optional AI Features and Data Flow

未实现，无模型 API 调用、凭证或外部用户数据流。

## Design Decisions and Limitations

当前整合 A/B/C Day 2，并补跨模块发布岗位→推荐→时段→删除保护测试。剩余 5 项占位属于投递/申请人及候选人预约/竞争。各分支交接为历史状态，当前情况以本文与集成记录为准。

数据库/API 使用 UTC，时段 UI 使用北京时间 Asia/Shanghai。构建与测试见 docs/DAY2_INTEGRATION.md；演示 seed 不清空业务库，完整申请/预约重置待后续实现。

## Continuous Integration

`.github/workflows/ci.yml` 在 push、pull_request 和手动触发时执行两个检查：Python 3.12 + PostgreSQL 17 的完整后端单元测试（同时做依赖一致性、Django 配置和迁移遗漏检查）；Node 22 的前端单元测试和生产构建。依赖从已有锁文件安装。

后端 CI 只连接本次运行的 PostgreSQL service；pytest-django 创建独立 `test_superball_ci`，不连接演示库或外部服务。日志用 `-ra` 明确列出未实现业务的 skip；CI 通过不是全部课程需求完成。每次推送的实际结果见 [GitHub Actions](https://github.com/XiangCheng66/CSC4801_superball/actions)，不能将本地命令验证等同于远程 CI 通过。
