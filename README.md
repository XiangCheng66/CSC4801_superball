# CSC4801 Superball · 招聘与求职者匹配

**中文** | [English](README.en.md)

Superball 是 CSC4801 期末项目。求职者维护技能和私有文字简历、查看岗位匹配分、投递并预约面试。雇主维护公司与岗位、按匹配分查看申请人、更新申请状态并管理面试时段。

## 架构

React 提供浏览器工作台，Django API 使用 Session Cookie 识别用户，对写请求执行 CSRF 校验，并在服务端检查角色、对象所有权与业务规则，PostgreSQL 保存业务数据。求职者推荐与雇主申请人列表共用技能匹配模块，预约通过数据库事务和唯一约束处理并发冲突。Docker Compose 启动应用与数据库。

团队成员为 XiangCheng66（项目基础、认证与求职者）、Isochiot（雇主、岗位与申请管理）、JeRant（匹配、时段与预约）。

## 快速开始

按 [安装指南](INSTALL.md) 准备 Docker 和本地 `.env`，在仓库根目录构建并启动应用。容器启动时会执行迁移。

```sh
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
```

打开 [本地工作台](http://127.0.0.1:8000/)。

## 本地演示数据

启动后执行一条命令重置并填充演示数据库。该命令会删除原有业务记录，请在专用本地演示库执行。

```sh
docker compose exec -T app python manage.py seed_demo
```

**仅供本地演示的账号。** 下列账号的密码均为 `LocalDemo!2026`，可使用用户名登录。

| 角色 | 用户名 | 技能 |
|---|---|---|
| 求职者 | `candidate1` / `candidate2` / `candidate3` | Python、SQL / Python / Rust |
| 雇主 | `employer1` / `employer2` | — |

- 两个有技能要求的岗位 `[DEMO-A2] Backend Developer` 和 `[Local demo] Data Analyst` 均要求 Python、SQL。三名求职者对 Backend Developer 的匹配分依次为 **100、50、0**，对无技能要求的 `[DEMO-A2] Generalist` 均为 **100**。
- 演示申请覆盖 `Pending`、`Interviewing`、`Rejected`、`Accepted`。`candidate1` 与 `candidate3` 对 `employer1` 的申请均为 `Interviewing`，两人都可预约该雇主北京时间次日 09:00 的同一个可用时段。

## 单元测试

按安装指南配置本机 PostgreSQL、Python 虚拟环境及前端依赖后，从仓库根目录运行。以下命令非交互执行完整后端与前端单元测试，任一套件失败即返回非零退出码。

```sh
TEST_DATABASE_ENGINE=postgresql python -m pytest tests/unit -q -ra && npm --prefix frontend test
```

Windows PowerShell 可运行同等命令：

```powershell
cmd.exe /d /c "set TEST_DATABASE_ENGINE=postgresql&& .venv\Scripts\python.exe -m pytest tests/unit -q -ra && npm.cmd --prefix frontend test"
```

后端使用独立测试库。使用默认 SQLite 可快速验证其余用例，两个真实并发预约用例需要 PostgreSQL。

## 需求与测试映射

Python 用例位于 [tests/unit](tests/unit/)，表中以 `文件::用例` 标明。前端用例按文件和 Vitest 名称标明。

| 需求 | 实现位置 | 具名单元测试或验收证据 |
|---|---|---|
| FP-ARCH-1 全栈应用 | `frontend/`、`backend/`、`Dockerfile`、`compose.yaml` | `frontend/e2e/hiring-flow.spec.js` 验证招聘流程，Compose 健康检查验证应用和数据库启动 |
| FP-AUTH-1 注册与会话 | `backend/accounts/models.py`、`backend/accounts/views.py` | `test_auth.py::test_fp_auth_1_registration_and_session_lifecycle`、`test_auth.py::test_fp_auth_1_invalid_registration`、`test_auth.py::test_duplicate_account_is_rejected_case_insensitively` |
| FP-AUTH-2 密码与公开字段 | `backend/accounts/models.py`、`backend/accounts/serializers.py` | `test_auth.py::test_fp_auth_2_salted_hash_and_password_verification` |
| FP-AUTH-3 服务端授权 | `backend/common/authentication.py`、`backend/common/permissions.py` | `test_auth.py::test_fp_auth_3_authorization_and_missing_object`、`test_auth.py::test_role_permissions_are_enforced_by_server` |
| FP-CAN-1 资料与私有简历 | `backend/candidates/` | `test_workflows.py::test_fp_can_1_profile_and_private_resume_rules`、`test_candidate.py::test_invalid_profile_input_is_atomic`、`test_candidate.py::test_other_users_cannot_read_or_replace_private_resources` |
| FP-CAN-2 全量岗位推荐 | `backend/candidates/views.py`、`backend/matching/ranking.py`、`frontend/src/pages/candidate/` | `test_workflows.py::test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs`、`test_candidate.py::test_persisted_skills_feed_shared_matching` |
| FP-CAN-3 投递与本人申请 | `backend/applications/`、`frontend/src/pages/candidate/Applications.jsx` | `test_workflows.py::test_fp_can_3_pending_duplicate_and_application_owner`、`test_applications.py::test_candidate_cannot_change_or_withdraw_own_application`、`test_applications.py::test_own_list_contains_all_statuses_current_jobs_company_and_persisted_booking` |
| FP-EMP-1 公司资料 | `backend/employers/` | `test_employer_api.py::test_fp_emp_1_employer_creates_and_reads_own_profile`、`test_employer_api.py::test_fp_emp_1_profile_update_replaces_values`、`test_employer_api.py::test_fp_emp_1_invalid_profile_is_rejected` |
| FP-EMP-2 岗位管理 | `backend/jobs/`、`backend/scheduling/models.py` | `test_employer_api.py::test_fp_emp_2_employer_creates_a_posting_with_skills`、`test_employer_api.py::test_fp_emp_2_invalid_posting_is_rejected`、`test_employer_api.py::test_fp_emp_2_partial_update_changes_only_supplied_fields`、`test_employer_api.py::test_fp_emp_2_other_employer_cannot_edit_or_delete`、`test_employer_api.py::test_fp_emp_2_delete_posting_without_dependents_removes_it`、`test_employer_api.py::test_fp_emp_2_delete_posting_with_applications_returns_409`、`test_scheduling.py::test_job_with_slot_is_protected` |
| FP-EMP-3 申请人排序与状态 | `backend/applications/employer_views.py`、`backend/matching/ranking.py` | `test_employer_applicants.py::test_fp_emp_3_applicants_are_ranked_by_match_score_descending`、`test_employer_applicants.py::test_fp_emp_3_each_row_carries_identity_skills_score_status_and_booking`、`test_employer_applicants.py::test_fp_emp_3_owner_sets_each_allowed_status`、`test_employer_applicants.py::test_fp_emp_3_invalid_status_input_is_rejected`、`test_employer_applicants.py::test_fp_emp_3_other_employer_cannot_change_status` |
| FP-MATCH-1 技能匹配与同分排序 | `backend/matching/services.py`、`backend/matching/ranking.py` | `test_matching.py::test_fp_match_1_examples_normalization_and_floor`、`test_matching.py::test_fp_match_1_both_tie_breakers`、`test_matching.py::test_resume_text_cannot_change_match_score_or_order` |
| FP-MATCH-2 可选 AI 增强 | N/A | N/A |
| FP-SCHED-1 面试时段 | `backend/scheduling/views.py`、`backend/scheduling/models.py` | `test_scheduling.py::test_fp_sched_1_slot_creation_timezones_and_deletion`、`test_scheduling.py::test_fp_sched_1_invalid_slots`、`test_scheduling.py::test_booked_excluded_and_deletion_protected` |
| FP-SCHED-2 预约资格与可见性 | `backend/scheduling/booking_services.py`、`backend/scheduling/booking_views.py` | `test_booking.py::test_fp_sched_2_eligible_booking`、`test_booking.py::test_fp_sched_2_ineligible_booking`、`test_booking.py::test_status_change_keeps_booking_visible_and_slot_protected` |
| FP-SCHED-3 并发预约 | `backend/scheduling/booking_services.py`、`backend/scheduling/models.py` | `test_booking.py::test_fp_sched_3_conflict_contract`、`test_booking.py::test_postgres_concurrent_bookings` |
| FP-SEC-1 对象访问隔离 | `backend/candidates/views.py`、`backend/applications/`、`backend/jobs/views.py`、`backend/scheduling/booking_services.py` | `test_candidate.py::test_other_users_cannot_read_or_replace_private_resources`、`test_applications.py::test_other_candidate_cannot_access_or_change_an_application`、`test_employer_api.py::test_fp_emp_2_other_employer_cannot_edit_or_delete`、`test_employer_applicants.py::test_fp_emp_3_applicant_list_enforces_role_and_ownership`、`test_booking.py::test_permissions_missing_records_and_list_isolation` |
| FP-SEC-2 参数绑定 | `backend/accounts/models.py`、`backend/candidates/views.py` | `test_auth.py::test_sql_metacharacters_remain_bound_values`、`test_candidate.py::test_profile_and_resume_sql_metacharacters_stay_bound` |
| FP-SEC-3 文本转义 | `frontend/src/components/AccountHome.jsx`、`frontend/src/pages/candidate/`、`frontend/src/pages/employer/` | `frontend/src/App.test.jsx` 的 `submits the selected registration role and escapes user-controlled display names`，`frontend/src/pages/candidate/CandidateWorkspace.test.jsx` 的 `preserves raw resume whitespace, escapes its preview and saves independently of profile drafts`，`frontend/src/pages/employer/EmployerWorkspace.test.jsx` 的 `escapes user-controlled job text instead of injecting markup` |
| FP-SEC-4 配置与测试隔离 | `.env.example`、`.gitignore`、`backend/config/test_settings.py`、`.github/workflows/ci.yml` | 环境变量示例、Git 跟踪文件及隔离测试库配置审查 |
| FP-PROC-1 设计规格 | `SPEC.md`、`SPEC.en.md` | 对照实现审查架构、模型、权限、API、界面、匹配和预约事务 |
| FP-DOC-1 安装说明 | `INSTALL.md`、`INSTALL.en.md`、`Dockerfile`、`compose.yaml` | 依安装指南从干净检出构建、迁移、初始化并运行测试 |
| FP-DOC-2 仓库 README | `README.md`、`README.en.md` | 核对必备章节与全部 25 个需求编号 |
| FP-DOC-3 确定性演示数据 | `backend/common/management/commands/seed_demo.py` | `test_seed_demo.py::test_seed_demo_builds_the_documented_dataset`、`test_seed_demo.py::test_seed_demo_reproduces_all_four_match_examples`、`test_seed_demo.py::test_seed_demo_supplies_two_interviewing_candidates_for_one_slot`、`test_seed_demo.py::test_seed_demo_is_repeatable_and_resets_business_rows` |
| FP-TEST-1 自动验证 | `tests/unit/`、`frontend/src/`、`.github/workflows/ci.yml` | 上述非交互命令及 CI 的 PostgreSQL、Vitest 作业 |
| FP-SUB-1 提交格式 | `Dockerfile`、`compose.yaml`、`docker/entrypoint.sh`、`INSTALL.md` | 提交公开 `main` 上含 40 位 SHA 的永久链接，并在同一提交验证构建、启动、seed、测试与浏览器流程 |

## 文档索引

| 文档 | 内容 |
|---|---|
| [INSTALL.md](INSTALL.md) · [English](INSTALL.en.md) | 依赖、环境变量、构建、迁移、测试与故障排查 |
| [SPEC.md](SPEC.md) · [English](SPEC.en.md) | 架构、数据模型、界面、权限、匹配与预约事务 |
| [接口契约](docs/API_CONTRACT.md) · [匹配契约](docs/MATCHING_CONTRACT.md) · [预约契约](docs/BOOKING_CONTRACT.md) | 请求、响应与业务规则 |
| [演示数据](docs/DEMO_DATA.md) | 完整数据集与重置范围 |
| [审计 Issue Form](.github/ISSUE_TEMPLATE/audit_bug_report.yml) · [审计标签配置](.github/labels.yml) | 跨组审计报告入口与标签定义 |
| [课程项目页](https://sra-research.github.io/CSC4801/project.html) | 课程要求与提交安排 |

## 已知限制

简历仅支持纯文本。可选的 PDF 解析与 AI 匹配解释未实现。

界面支持中文/英文切换（页头右上角，默认中文，选择存于 `localStorage` 的 `superball.lang`）。产品名、角色值、申请状态值、岗位标题、公司名与技能不翻译；网络层兜底错误（如服务不可达）仍由前端请求模块以中文抛出。
