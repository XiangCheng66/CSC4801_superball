# Superball 项目规格

**中文** | [English](SPEC.en.md)

## 产品范围与架构

系统有两种角色。求职者维护个人资料、查看按技能排序的岗位、投递并预约面试。雇主维护公司和岗位、查看申请人、更新申请状态及管理时段。

- `frontend/` 使用 React 19 和 Vite。`frontend/src/App.jsx` 恢复会话并选择工作台，`frontend/src/api/client.js` 处理 JSON、会话 Cookie、CSRF 与 API 错误。
- `backend/` 使用 Django 5.2 与 Django REST Framework。各领域模块负责校验、权限和写入，`backend/matching/` 提供无状态的评分与排序。
- PostgreSQL 17 持久化业务和会话数据。开发时 Vite 代理 `/api/`。Docker 多阶段构建前端，运行时 Gunicorn 与 WhiteNoise 在同一站点提供页面、静态资源和 API。

## 数据模型与关系

| 模型 | 关系和约束 |
|---|---|
| `accounts.User` | 自定义 Django 用户，角色只能为 `Candidate` 或 `Employer`。数据库对用户名、邮箱按小写施加唯一约束。保存显示名和 Django 密码哈希。 |
| `candidates.CandidateProfile` | 与用户一对一，以用户 ID 为主键。保存技能 JSON 数组、私有简历原文和时间戳。资料尚未创建时读取账号显示名、空技能和空简历，首次写入创建记录。 |
| `employers.CompanyProfile` | 与雇主一对一，以用户 ID 为主键，保存非空公司名和描述。 |
| `jobs.Job` / `RequiredSkill` | 岗位关联雇主账号，含非空标题和描述。技能以岗位子表存储，同一岗位内技能名按小写唯一，允许空列表。 |
| `applications.Application` | 关联求职者与岗位，`UNIQUE(job, candidate)`。创建默认 `Pending`。数据库限制四种状态 `Pending`、`Interviewing`、`Rejected`、`Accepted`。 |
| `scheduling.InterviewSlot` | 关联岗位，由岗位派生雇主，保存开始与结束时间。数据库约束时长为 30 分钟。 |
| `scheduling.Booking` | 分别与申请、时段一对一，每个申请和时段最多一条预约。 |

申请和时段通过 `PROTECT` 引用岗位，预约同样保护关联的申请和时段。删除有申请或时段的岗位返回 `409`。候选人资料与简历各自更新所属字段，写入事务锁定用户行并创建或更新资料。显示名保存在 `User`。

## 认证与授权

注册使用 Django 密码校验，保存 PBKDF2-SHA256 盐化哈希。登录使用用户名和密码，用户名匹配不区分大小写。注册和登录建立数据库会话，Cookie 使用 `HttpOnly` 和 `SameSite=Lax`。退出使会话失效。

后端从会话确定用户。`IsCandidate` 和 `IsEmployer` 检查角色，视图和服务再检查对象所有权。匿名访问受保护接口返回 `401`，角色错误或访问他人对象返回 `403`，有权查询但对象不存在返回 `404`。列表查询按用户和角色过滤。

## API

成功返回 `{"data": ...}`。失败返回包含 `code`、`message` 和可选 `fields` 的 `error` 对象。请求路径使用末尾斜杠。详细字段见 [API 契约](docs/API_CONTRACT.md)。

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/health/` | 数据库就绪检查，成功返回 200，连接失败返回 503 |
| GET | `/api/auth/csrf/` | 获取 CSRF Cookie 与令牌 |
| POST | `/api/auth/register/` | 注册并登录，返回 201 |
| POST | `/api/auth/login/` | 按用户名和密码登录 |
| POST | `/api/auth/logout/` | 注销当前会话 |
| GET | `/api/auth/me/` | 恢复当前账号信息 |
| GET | `/api/auth/users/<user_id>/` | 读取本人账号 |
| GET | `/api/candidate/session/` | 校验求职者角色 |
| GET | `/api/employer/session/` | 校验雇主角色 |
| GET / PUT | `/api/candidate/profile/` | 读取或保存本人显示名和技能 |
| GET / PUT | `/api/candidate/profiles/<user_id>/` | 按 ID 访问本人资料 |
| GET / PUT | `/api/candidate/resume/` | 读取或替换本人简历原文 |
| GET / PUT | `/api/candidate/resumes/<user_id>/` | 按 ID 访问本人简历 |
| GET | `/api/candidate/recommendations/` | 查看全部当前岗位、所需技能和匹配分 |
| GET / POST | `/api/applications/` | 列出本人申请，或为岗位创建一条 `Pending` 申请 |
| GET | `/api/applications/<application_id>/` | 查看本人申请详情及已有预约 |
| GET / PUT | `/api/employer/company/` | 读取或保存本人公司资料，首次保存返回 201 |
| GET / POST | `/api/employer/jobs/` | 查看或发布本人岗位 |
| GET / PATCH / DELETE | `/api/employer/jobs/<job_id>/` | 查看、修改或删除本人岗位 |
| GET | `/api/employer/jobs/<job_id>/applicants/` | 查看本人岗位按匹配分排序的申请人 |
| PATCH | `/api/employer/applications/<application_id>/status/` | 设置本人岗位申请的四种状态之一 |
| GET / POST | `/api/slots/` | 列出或新增本人面试时段 |
| GET | `/api/slots/jobs/` | 查看时段表单可选的本人岗位 |
| GET / DELETE | `/api/slots/<slot_id>/` | 查看本人时段，或删除未开始且无预约的时段 |
| GET | `/api/booking-applications/` | 查看本人可发起预约的申请 |
| GET | `/api/booking-applications/<application_id>/slots/` | 查看该申请对应雇主的可用时段 |
| GET / POST | `/api/bookings/` | 双方查看本人预约，求职者提交预约 |
| GET | `/api/bookings/<booking_id>/` | 查看本人申请或本人时段的预约 |

## 主要页面与流程

- **账号入口**提供注册和登录。账号页可刷新身份、校验角色和退出。重新加载从 `/api/auth/me/` 恢复会话。
- **求职者工作台**包含个人资料、私有简历、岗位推荐、我的申请和面试预约。投递服务在事务中锁定岗位，重复申请由查询与唯一约束保护，返回 `409`。本人申请展示岗位、雇主、状态与已有预约，状态由雇主维护。
- **雇主工作台**包含公司资料、岗位管理、申请人、面试时段及收到的预约。申请人行显示身份、技能、匹配分、状态和预约。只有岗位所有者可以修改状态。

## 技能存储、匹配与排序

求职者技能保存在 `CandidateProfile.skills`，岗位技能来自 `RequiredSkill`。`backend/matching/services.py` 将两边的字符串列表去首尾空白、转小写、移除空值并去重。设规范化后的求职者和岗位技能分别为 `C`、`R`。

```text
score = 100                            when R is empty
score = 100 * len(C & R) // len(R)      otherwise
```

`backend/matching/ranking.py` 共用该评分函数。两端先按分数降序。求职者端同分时按岗位标题的 `casefold()` 值、整数岗位 ID 排序。雇主端按显示名的 `casefold()` 值、整数求职者用户 ID 排序。全部当前岗位都参与推荐，包括零分；公司资料缺失时依次使用雇主显示名和用户名。简历不参与评分。接口约定见 [共享匹配契约](docs/MATCHING_CONTRACT.md)。

## 面试时段与预约事务

时段必须在未来并且恰好 30 分钟。API 接收带明确时区的输入并以 UTC 返回，页面按 `Asia/Shanghai` 显示。雇主只能删除本人的未开始、未预约时段。

预约要求申请属于当前求职者、状态为 `Interviewing`、时段属于申请岗位的雇主、时段尚未开始且可用、申请无已有预约。同一雇主的其他岗位时段也可预约。

`backend/scheduling/booking_services.py` 在 `transaction.atomic()` 内按申请、时段顺序执行 `SELECT FOR UPDATE`，取得两行的锁后检查资格并创建预约。两处一对一唯一约束为并发写入提供最终保护。若两人同时争同一时段，先提交的预约保留，另一请求收到 `409 Slot already booked`。若插入触发完整性错误，回滚后核实冲突，其他数据库错误继续抛出。两端通过同一预约记录展示结果，后续申请状态改变仍保留预约。详见 [预约契约](docs/BOOKING_CONTRACT.md)。

## 安全控制与限制

- 注册、登录和会话写请求校验 CSRF，输入序列化器拒绝额外的角色或所有者字段。响应按字段白名单输出。简历仅本人可读写，申请人列表仅返回业务所需的候选人信息。
- 业务查询通过 Django ORM 绑定值，React 将用户输入作为文本渲染。`/api/` 响应使用 `Cache-Control: no-store`，切换账号时重建工作台并忽略旧会话的响应。
- 本地秘密使用未跟踪的 `.env`。单元测试使用独立 SQLite 或 PostgreSQL 测试库，两个真实并发预约用例需要 PostgreSQL。
- 简历为纯文本。可选 PDF 解析与 AI 增强未实现，业务数据不发送到外部模型。

需求与测试映射见 [README](README.md)。环境和验证命令见 [INSTALL](INSTALL.md)。
