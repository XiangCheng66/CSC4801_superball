# CSC4801 Superball — Recruiting and Candidate Matching

## Project Overview

本项目是 CSC4801 期末项目：构建一个可在本地运行的招聘与求职者匹配平台。应用包含且仅包含 `Candidate`（求职者）和 `Employer`（雇主）两种业务角色。

第一版需要打通以下流程：

```text
雇主注册 → 完善公司资料 → 发布岗位
求职者注册 → 填写技能与文字简历 → 查看岗位及匹配分数 → 投递
雇主查看申请人 → 将申请改为 Interviewing → 创建面试时段
求职者预约 → 求职者与雇主均能查看预约
```

**当前阶段：A Day 2 已接入个人资料、私有文字简历和岗位推荐。** 求职者可编辑显示名和持久化技能、保存/替换仅本人可访问的简历，并查看全部岗位及 C 的统一匹配分数。保留 A/B/C Day 1 的认证、雇主域模型、评分排序和 CI。投递及申请列表、雇主业务 HTTP 接口与页面、面试预约仍待实现，对应 9 个占位测试明确 skipped。课程要求优先于团队规划。

## Team Members

- JeRant
- Isochiot
- XiangCheng66（A：项目与认证基础、求职者模块）

A 已由 XiangCheng66 认领；C 职责已认领，成员姓名对应与 B 的实际负责人由团队补充。

## Architecture Summary

### 技术方案

| 部分 | 开发基线 | 职责 |
|---|---|---|
| 前端 | React（已确定） | 页面、表单、交互与 API 调用 |
| 后端 | Python + Django 5.2 + Django REST Framework | 已建立认证、求职者资料/简历/推荐 API；雇主与预约接口待补 |
| 数据库 | PostgreSQL 17 | 已建立账号、求职者资料、公司、岗位、岗位技能和申请迁移；预约约束后续补充 |
| 验证 | pytest + pytest-django；Vitest；可选 Playwright | 默认隔离内存测试库，也支持独立 PostgreSQL 测试库 |
| 交付 | 多阶段 Dockerfile + Compose | 已验证本地干净镜像构建、Python 服务与 PostgreSQL，见 A Day 2 交接 |

React 调用 Python API；后端校验角色、所有权和业务规则后访问数据库，并返回 JSON。匹配分数和预约资格由后端统一计算和校验。

参考：[Django](https://www.djangoproject.com/start/)、[Django REST Framework](https://www.django-rest-framework.org/)、[PostgreSQL 数据约束](https://www.postgresql.org/docs/current/ddl-constraints.html)。Python 版本锁在 `requirements.lock`，前端版本锁在 `frontend/package-lock.json`。

### 规划目录

下列目录包含已实现模块与后续目标；accounts/common/config/candidates/employers/jobs/applications/matching 已建立，前端已有账号和求职者工作台，employer/scheduling 页面仍待实现。

```text
CSC4801_superball/
├── frontend/src/
│   ├── api/                    # 公共请求函数
│   ├── components/             # 公共组件
│   └── pages/
│       ├── auth/               # A
│       ├── candidate/          # A：资料、私有简历、推荐
│       ├── employer/           # B
│       └── scheduling/         # C
├── backend/
│   ├── accounts/               # A
│   ├── common/                 # 已建立：公共认证、权限、响应与健康检查
│   ├── config/                 # 已建立：Django 配置与路由
│   ├── candidates/             # A：模型、权限 API、推荐和演示 seed
│   ├── employers/              # B：已建立公司资料模型
│   ├── jobs/                   # B
│   ├── applications/           # B
│   ├── matching/               # C：已建立共享评分与排序服务
│   └── scheduling/             # C
├── tests/unit/
├── .github/workflows/ci.yml    # C：后端测试、前端测试与构建
├── Dockerfile
├── SPEC.md
├── INSTALL.md
└── README.md
```

## Team Responsibilities

每个人负责所属模块的 React 页面、Python API、单元测试和文档。所有成员都需要理解完整业务流程，并能解释和修改提交的代码。

| 职责 | React 页面 | 后端工作 | 主要需求 |
|---|---|---|---|
| A：账号与求职者 | 注册、登录、个人资料、私有简历、岗位推荐、我的申请 | 认证、公共权限基础、资料与简历；接入 B 的投递逻辑和 C 的匹配函数 | FP-AUTH-1～3、FP-CAN-1～3 |
| B：雇主与招聘 | 公司资料、岗位管理、申请人列表、状态修改 | 公司与岗位管理、申请创建、防重复投递、申请人查询与状态管理 | FP-EMP-1～3，并与 A 协作 FP-CAN-3 |
| C：匹配与预约 | 雇主面试时段、求职者预约、预约详情 | 共享匹配算法、时段管理、资格检查、预约事务和并发冲突处理 | FP-MATCH-1、FP-SCHED-1～3 |

| 公共工作 | 牵头职责 | 配合要求 |
|---|---|---|
| 项目骨架、公共配置、Docker、INSTALL.md | A | 三个人均从干净 checkout 验证安装与启动 |
| 确定性演示数据、README.md 汇总 | B | 各模块提供数据、演示步骤及测试映射 |
| CI、SPEC.md 架构及事务说明 | C | 各模块补充设计、接口、权限与验证说明 |
| 单元测试和安全检查 | A/B/C 各自负责 | 交叉审查，不能全部交给一人 |

### 共享边界

- A 的投递页面调用 B 的申请服务；申请校验和写库逻辑只实现一套。
- A 的岗位推荐和 B 的申请人列表共同调用 C 的匹配函数。
- C 的预约模块使用已认证身份和 B 的申请数据；仍需自行验证对象所有权与预约资格。
- 公共请求函数、登录状态管理、错误格式与路由入口在第一天统一。各模块的角色和所有权检查必须在后端执行。

## Shared Contracts

### 开工前共同确认

1. 已落地 Django 会话 Cookie + CSRF；所有模块使用 [公共 API 契约](docs/API_CONTRACT.md) 和 `frontend/src/api/client.js`。保护操作遵守未登录 `401`、角色/所有权错误 `403`、允许访问但对象不存在 `404` 的约定。
2. 数据模型：`User`、`CandidateProfile`、`CompanyProfile`、`Job`、`Application`、`InterviewSlot`、`Booking`，以及技能存储和时区策略。
3. 唯一约束：账号标识、`Application(candidate_id, job_id)`、`Booking.slot_id`、`Booking.application_id`。
4. API 请求字段、响应字段、错误码及公共服务函数。数据库模型和迁移变更提前通知队友。

认证、求职者资料/简历及推荐接口已实现，详见 SPEC 与公共/求职者契约；以下范围同时包含已实现的 A 接口和 B/C 的后续接口草稿：

| 负责人 | API 范围草稿 |
|---|---|
| A | `/api/auth/`、`/api/candidate/profile/`、`/api/candidate/resume/`、`/api/candidate/recommendations/` |
| B | `/api/jobs/`、`/api/applications/`、`/api/employer/` |
| C | `/api/slots/`、`/api/bookings/`，以及后端共享匹配函数 |

建议共享服务：`calculate_match_score(candidate_skills, required_skills)`、`apply_to_job(candidate, job_id)`、`update_application_status(employer, application_id, status)`、`book_interview(candidate, application_id, slot_id)`。

匹配函数和 `rank_jobs/rank_applicants` 已实现，具体输入输出见 [共享匹配契约](docs/MATCHING_CONTRACT.md)。其余服务仍待对应模块实现；不得在前端或另一个后端模块复制评分公式。

### 必须保持的业务规则

- 账号唯一；密码使用成熟密码哈希方案；认证秘密不返回给客户端。
- 求职者只能维护自己的资料与文字简历。简历正文仅本人可读取，其他求职者和雇主直接访问都应收到 `403`。
- 新申请为 `Pending`；同一求职者不能重复投递同一岗位。状态仅限 `Pending`、`Interviewing`、`Rejected`、`Accepted`，仅岗位所属雇主能修改。
- 雇主只能管理自己的岗位和申请人。有申请或面试时段关联的岗位删除应返回 `409` 并保留原数据；无这些关联时可以删除。
- 技能先去首尾空格、转小写、去空值和去重。岗位技能集合为空时得分为 100，否则得分为 `floor(100 * |候选技能 ∩ 岗位技能| / |岗位技能|)`；简历正文不参与该分数。
- 求职者端列出全部当前岗位并按分数降序，同分按不区分大小写的岗位标题、稳定岗位 ID 排序。雇主端同分按不区分大小写的求职者显示名、稳定求职者 ID 排序。两端使用同一匹配实现。
- 面试时段必须在未来、长度恰好 30 分钟，时区明确；已预约时段不能删除或继续显示为可预约。
- 预约必须同时满足：申请属于当前求职者、时段属于申请对应雇主、状态为 `Interviewing`、时段未来且未占用、申请尚无预约。
- 预约依靠数据库事务、唯一约束或等价机制保持原子性。两名合格求职者争抢同一时段时恰好一人成功，另一人收到 `409` 和 `Slot already booked`，数据库仅有一条预约。
- 预约失败不能留下部分更新；已预约申请离开 `Interviewing` 后，原预约仍保留，时段仍不可用。
- 使用安全 ORM/参数化查询、HTML 转义及隔离测试数据。测试不得调用真实第三方服务，涉及数据库的测试使用隔离测试库。
- AI 解释属于后续可选增强，不得改变规定的分数或排序；核心系统和测试须能在没有付费凭证时运行。

## Development Plan

### 第一周计划

以下按相对开发日安排；实际时间须服从课程公布的冻结和提交日期。

| 时间 | A | B | C | 共同验收 |
|---|---|---|---|---|
| 第 1 天 | 项目与认证骨架、公共请求约定 | 公司/岗位/申请模型设计 | 匹配函数和测试、CI 骨架 | 三个人均能启动项目；React 显示 API 从数据库读取的演示数据 |
| 第 2～3 天 | 登录、资料、技能、私有简历 | 公司资料、岗位管理 | 匹配排序、时段管理 | 求职者看到真实岗位及正确分数 |
| 第 4～5 天 | 投递入口、我的申请 | 防重复投递、申请人查询、状态修改 | 预约资格、事务及冲突处理 | 完整走通投递、进入面试、预约 |
| 第 6～7 天 | 求职者权限和安装流程 | 雇主权限和演示数据 | 预约冲突与集成修复 | Docker 环境中运行主流程并执行真实单元测试 |

第一轮业务演示：**雇主发布一条岗位 → 求职者登录 → 看到该岗位及正确匹配分数。** 后续再接入申请和预约。必需功能、测试和 Docker 稳定后再完善视觉效果及可选 AI 功能。

### Git 协作与完成标准

- 从最新 `main` 创建小功能分支，例如 `feat/auth`、`feat/candidate-profile`、`feat/job-management`、`feat/interview-booking`。
- 一个 PR 聚焦一个可验证功能，并说明对应需求、行为、验证方法及数据库/共享接口变更。
- 至少另一名成员审查；建议 A 审 B、B 审 C、C 审 A。检查通过后合并 `main`，每天集成一次主流程。
- 完成标准：页面可操作、后端权限和校验正确、数据真实持久化、成功及适用错误场景有具名测试、文档与映射同步。
- 第 11 周功能冻结；第 12 周按课程审计规则审查、修复并记录回归证据；第 13～14 周展示。具体日期以课程发布为准。
- 最终提交公开仓库 `main` 上确切 commit 的永久 URL，并确保同一 commit 的 Dockerfile 和文档化启动、seed、测试流程可复现。

## Quick Start

当前可先获取仓库：

```bash
git clone https://github.com/XiangCheng66/CSC4801_superball.git
cd CSC4801_superball
```

完整命令见 [INSTALL.md](INSTALL.md)。有 Docker 的本地环境可复制并修改配置，然后构建启动：

```bash
cp .env.example .env
# 修改 .env 中的秘密和数据库密码占位值；PowerShell 复制使用 Copy-Item。
docker compose pull db
docker compose build app
docker compose up -d
docker compose exec -T app python manage.py seed_candidate_demo
```

访问 `http://127.0.0.1:8000`。本机开发按 INSTALL.md 建立 PostgreSQL、运行迁移和 Day 2 seed，分别启动 Python 后端（8000）与 React 前端（5173）。求职者登录后可切换个人资料和岗位推荐；雇主目前仍显示账号页。

## Demo Accounts

执行 `python manage.py seed_candidate_demo` 后可使用以下公开的 **local/demo** 账号：

| 用户名 | 身份 | 密码 |
|---|---|---|
| `candidate1`、`candidate2`、`candidate3` | Candidate | `LocalDemo!2026` |
| `employer1`、`employer2` | Employer | `LocalDemo!2026` |

邮箱为 `<username>@example.test`。`seed_auth_demo` 仍只维护原四个账号；`seed_candidate_demo` 调用它，再维护第三个求职者、技能、两份演示公司资料和两个 `[DEMO-A2]` 岗位。三个求职者技能为 Python/SQL、Python、Rust，对要求 Python/SQL 的岗位得分 100/50/0，对无要求的岗位均为 100。重复执行保持演示岗位 ID、私有简历及其他用户/岗位，不清空申请或预约；保留演示账号的密码和显示名会恢复为公开演示值。

最终完整重置/seed 命令仍待 B/C 补齐：当前命令是资料与推荐演示，不满足四种申请状态、预约竞争数据等完整 FP-DOC-3 要求。

## Running Unit Tests

安装锁定依赖后，在仓库根目录使用虚拟环境的 Python 执行：

```bash
python -m pytest tests/unit -v
```

`test_auth.py`、`test_employer_domain_models.py`、`test_matching.py`、`test_candidate.py` 及 `test_workflows.py` 中 FP-CAN-1/2 为真实测试，覆盖认证、权限、CSRF、模型约束、私有简历、技能持久化、推荐和 SQL 绑定等。其余 9 项业务模板 skipped；默认使用隔离 SQLite 内存库，PostgreSQL 方式见 INSTALL.md，失败返回非零退出码。

前端在 `frontend` 目录执行 `npm test` 和 `npm run build`。可选真实浏览器测试为 `npm run test:e2e`，需先启动本地 PostgreSQL 演示环境和服务。C 已配置 `.github/workflows/ci.yml`，自动执行 PostgreSQL 后端测试、Django/迁移检查、前端测试和构建；实际运行结果见 [GitHub Actions](https://github.com/XiangCheng66/CSC4801_superball/actions)。

A Day 2 的实现与验证记录见 [交接文档](docs/A_DAY2_HANDOFF.md)。Day 1 分支交接中的测试数和 Docker 状态是历史记录，不代表当前提交的验证结果。

覆盖成功、输入校验、权限和冲突情形，特别检查 `401/403/404`、技能归一化与两端同分排序、越权、SQL 绑定值、XSS 转义及预约冲突。课程只要求单元测试；数据库原子性仍需通过实现和运行环境验证。

## Requirement–Test Mapping

**下表同时保留已实现功能与后续规划。** FP-CAN-1/2 已有真实 API/页面与测试；其余工作流模板和预约仍 skipped。雇主域模型约束通过不代表对应接口和页面已经实现。

| Requirement ID | 负责人 / 行为 | 实现文件或位置（规划） | Unit test(s) / verification evidence（待完成） |
|---|---|---|---|
| FP-ARCH-1 | 全员：账号与求职者资料/推荐全栈已完成 | `frontend/`、`backend/`、`Dockerfile`、`compose.yaml` | 构建、数据库、浏览器记录见 A Day 2 交接；申请/雇主/预约工作流待补 |
| FP-AUTH-1 | A：已实现注册、登录、退出、唯一标识 | `backend/accounts/models.py`、`serializers.py`、`views.py` | `tests/unit/test_auth.py::test_fp_auth_1_registration_and_session_lifecycle`；`test_fp_auth_1_invalid_registration`；`test_duplicate_account_is_rejected_case_insensitively`（同文件） |
| FP-AUTH-2 | A：已实现密码哈希、公开字段白名单 | `backend/accounts/models.py`、`serializers.py` | `tests/unit/test_auth.py::test_fp_auth_2_salted_hash_and_password_verification` |
| FP-AUTH-3 | A 已实现基础，其他模块后续复用 | `backend/common/authentication.py`、`permissions.py`、`backend/accounts/views.py` | `tests/unit/test_auth.py::test_fp_auth_3_authorization_and_missing_object`；`test_role_permissions_are_enforced_by_server`（同文件） |
| FP-CAN-1 | A：资料、技能、私有简历已实现 | `backend/candidates/`、`frontend/src/pages/candidate/` | `tests/unit/test_workflows.py::test_fp_can_1_profile_and_private_resume_rules`；`tests/unit/test_candidate.py::test_invalid_profile_input_is_atomic`；`test_other_users_cannot_read_or_replace_private_resources`；`test_missing_owner_has_404_and_own_alias_is_equivalent`；`test_resume_first_save_and_large_raw_text_preserve_other_fields`（后四项同文件） |
| FP-CAN-2 | A/C：全部岗位、分数和排序已接入页面 | `backend/candidates/views.py`、`backend/matching/`、`frontend/src/pages/candidate/` | `tests/unit/test_workflows.py::test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs`；`tests/unit/test_candidate.py::test_persisted_skills_feed_shared_matching`；`test_uninitialized_profile_and_company_fallbacks`；`test_resume_never_leaks_or_changes_recommendations`（后两项同文件） |
| FP-CAN-3 | A/B：申请默认状态与防重复模型约束已实现；接口待补 | `backend/applications/` | `tests/unit/test_employer_domain_models.py::test_fp_can_3_new_application_defaults_to_pending`；`test_fp_can_3_duplicate_application_is_rejected_by_the_database`（同文件）；工作流测试仍 skipped |
| FP-EMP-1 | B：公司资料模型及约束已实现；接口待补 | `backend/employers/` | `tests/unit/test_employer_domain_models.py::test_fp_emp_1_company_profile_is_one_per_employer`；`test_fp_emp_1_company_name_must_not_be_blank`（同文件）；工作流测试仍 skipped |
| FP-EMP-2 | B：岗位/技能约束和申请删除保护已实现；接口与时段关联待补 | `backend/jobs/` | `tests/unit/test_employer_domain_models.py::test_fp_emp_2_required_skills_are_case_insensitive_unique_per_job`；`test_fp_emp_2_delete_job_with_applications_is_protected`（同文件）；工作流测试仍 skipped |
| FP-EMP-3 | B/C：四态模型约束和共享排序已实现；查询/状态权限接口待补 | `backend/applications/`、`backend/matching/` | `tests/unit/test_employer_domain_models.py::test_fp_emp_3_all_four_statuses_are_storable`；`test_fp_emp_3_unknown_status_is_rejected_by_the_database`（同文件）；工作流测试仍 skipped |
| FP-MATCH-1 | C：共享算法；A：推荐页面和四分数演示已接入；雇主端待补 | `backend/matching/services.py`、`backend/matching/ranking.py` | `tests/unit/test_matching.py::test_fp_match_1_examples_normalization_and_floor`；`test_fp_match_1_both_tie_breakers`；`test_skill_normalization_does_not_mutate_input`；`test_invalid_skill_types_are_not_treated_as_empty`；`test_ranking_preserves_fields_without_mutating_rows`；`test_rankings_support_empty_rows_and_empty_skill_requirements`；`test_rankings_handle_one_shot_skill_and_row_iterables`；`test_resume_text_cannot_change_match_score_or_order`（同文件） |
| FP-MATCH-2 | 可选 AI 增强 | N/A，当前未计划实现 | N/A；实现后新增数据流说明和具名单元测试 |
| FP-SCHED-1 | C：未来 30 分钟时段及删除 | `backend/scheduling/` | `tests/unit/test_scheduling.py::test_fp_sched_1_slot_creation_timezones_and_deletion`；`test_fp_sched_1_invalid_slots`（同文件） |
| FP-SCHED-2 | C：预约资格、可见性、状态变更后保留 | `backend/scheduling/` | `tests/unit/test_scheduling.py::test_fp_sched_2_eligible_booking`；`test_fp_sched_2_ineligible_booking`（同文件）；补充已有预约保留断言 |
| FP-SCHED-3 | C：数据库原子性与冲突合同 | `backend/scheduling/`、约束/迁移 | `tests/unit/test_scheduling.py::test_fp_sched_3_conflict_contract`；另检查真实数据库原子性 |
| FP-SEC-1 | 求职者资料/简历边界已验证；申请、雇主和预约仍待补 | `backend/common/permissions.py`、`backend/candidates/views.py` | `tests/unit/test_candidate.py::test_other_users_cannot_read_or_replace_private_resources`；`test_candidate_endpoints_check_identity_before_objects`（同文件）；其他模块需继续验证 |
| FP-SEC-2 | 认证与求职者数据访问已验证 | `backend/accounts/models.py`、`backend/candidates/views.py` | `tests/unit/test_auth.py::test_sql_metacharacters_remain_bound_values`；`tests/unit/test_candidate.py::test_profile_and_resume_sql_metacharacters_stay_bound` |
| FP-SEC-3 | 账号、简历预览与岗位文本已验证；后续页面待补 | `frontend/src/pages/candidate/`、`frontend/src/components/AccountHome.jsx` | `frontend/src/App.test.jsx`：`submits the selected registration role and escapes user-controlled display names`；`CandidateWorkspace.test.jsx`：`preserves raw resume whitespace, escapes its preview and saves independently of profile drafts`；`renders zero-score jobs, empty requirements and escaped job text in server order` |
| FP-SEC-4 | 全员：秘密、个人数据、测试隔离 | 配置、`.env.example`、测试 fixtures | 仓库检查、隔离测试库和第三方服务替身证据 |
| FP-PROC-1 | 全员：规格与实际代码一致 | `SPEC.md` | 逐模块审查规格，确认成员能够解释与修改代码 |
| FP-DOC-1 | A 牵头：安装可复现 | `INSTALL.md`、`Dockerfile` | 由未搭建环境的成员按文档完成干净安装 |
| FP-DOC-2 | B 牵头：完整 README 与映射 | `README.md` | 逐项核对概览、架构、账号、测试、文档和全部需求映射 |
| FP-DOC-3 | 账号、技能和四分数演示已有；完整业务重置待补 | `backend/candidates/management/commands/seed_candidate_demo.py` | `tests/unit/test_candidate.py::test_candidate_demo_is_repeatable_preserves_other_data_and_covers_four_scores`；申请状态和竞争时段仍待补 |
| FP-TEST-1 | 认证、雇主模型、匹配、FP-CAN-1/2 已验证 | `tests/unit/`、`.github/workflows/ci.yml` | 完整后端测试与前端测试/构建接入 CI；剩余 9 项业务模板明确 skipped |
| FP-SUB-1 | 全员：确切 main commit 与完整 Docker 环境 | Git、`Dockerfile`、`INSTALL.md` | 在提交 commit 验证构建、依赖启动、迁移、seed、测试与 UI |

## Document Index

| 文档 | 用途 | 当前状态 |
|---|---|---|
| [README.md](README.md) | 项目概览、分工、启动计划与需求映射 | A Day 2 与 B/C Day 1 |
| [SPEC.md](SPEC.md) | 架构、模型、权限、API、匹配、预约事务与安全设计 | 认证、求职者资料/推荐、雇主模型与 CI 已记录 |
| [INSTALL.md](INSTALL.md) | 精确安装、启动、迁移、seed、测试和 Docker 指令 | 已提供基础运行方式 |
| [公共 API 契约](docs/API_CONTRACT.md) | 会话、CSRF、JSON、错误码和模块接入示例 | 已落地 |
| [A 第一天交接](docs/DAY1_HANDOFF.md) | 完成范围、验证证据、B/C 接入与后续工作 | 已提供 |
| [A 第二天交接](docs/A_DAY2_HANDOFF.md) | 资料/简历/推荐、迁移、验证与后续接入 | 已提供 |
| [求职者 API 契约](docs/CANDIDATE_CONTRACT.md) | 字段、隐私、错误边界与推荐响应 | 已实现 |
| [共享匹配契约](docs/MATCHING_CONTRACT.md) | A/B 调用方式、技能与排序字段、授权和公开响应边界 | C 已实现 |
| [C 第一天交接](docs/C_DAY1_HANDOFF.md) | 匹配、CI、验证记录及后续预约依赖 | 已提供 |
| [Dockerfile](Dockerfile) / [compose.yaml](compose.yaml) | React/Python 构建和 PostgreSQL 环境 | 构建与容器验证记录见 A Day 2 交接 |
| [课程项目页](https://sra-research.github.io/CSC4801/project.html) | 课程项目与审计安排 | 结合教师公布的最新要求核对 |

## Known Limitations

- 已完成账号基础、求职者资料/私有简历/岗位推荐、雇主域模型和共享匹配；投递及本人申请列表、雇主业务 API/页面、面试预约仍待实现。
- Docker 构建与验证结果见 A Day 2 交接及 PR；CI 本身只执行测试与前端构建，不替代 Docker 验证。
- `seed_candidate_demo` 覆盖资料与四种匹配分数，不是完整数据库重置；申请状态和竞争时段数据仍待补。
- 公共认证、求职者接口、雇主模型和匹配契约已确定；远程验证结果见 Actions。后续业务需继续复用授权与公开字段白名单。
