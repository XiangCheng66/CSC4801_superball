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

**当前阶段：课程模板与开发规划。本文中的技术栈、模块、接口和里程碑是开发计划，不代表已实现功能。** 当前单元测试仍为 `pass` 占位，不能作为需求完成证据。课程正式要求优先于团队规划；修改实现时同步维护本文、`SPEC.md` 和 `INSTALL.md`。

## Team Members

- JeRant
- Isochiot
- 第三位成员：待补充

A/B/C 表示待认领的职责，不预先对应上述成员。开工时填写实际负责人。

## Architecture Summary

### 技术方案

| 部分 | 开发基线 | 职责 |
|---|---|---|
| 前端 | React（已确定） | 页面、表单、交互与 API 调用 |
| 后端 | Python（已确定），框架计划使用 Django + Django REST Framework | 认证、权限、业务规则、数据校验与 JSON API |
| 数据库 | PostgreSQL（计划） | 持久化数据、外键、唯一约束与预约事务 |
| 验证 | Python 单元测试；测试运行器在搭建骨架时统一 | 验证实际业务逻辑、错误与冲突场景 |
| 交付 | Docker | 可从仓库源码重建完整环境 |

React 调用 Python API；后端校验角色、所有权和业务规则后访问数据库，并返回 JSON。匹配分数和预约资格由后端统一计算和校验。

参考：[Django](https://www.djangoproject.com/start/)、[Django REST Framework](https://www.django-rest-framework.org/)、[PostgreSQL 数据约束](https://www.postgresql.org/docs/current/ddl-constraints.html)。框架版本与全部依赖在项目骨架建立时统一并锁定。

### 规划目录

下列目录为目标结构；当前仓库仍保留课程模板文件。

```text
CSC4801_superball/
├── frontend/src/
│   ├── api/                    # 公共请求函数
│   ├── components/             # 公共组件
│   └── pages/
│       ├── auth/               # A
│       ├── candidate/          # A
│       ├── employer/           # B
│       └── scheduling/         # C
├── backend/
│   ├── accounts/               # A
│   ├── candidates/             # A
│   ├── jobs/                   # B
│   ├── applications/           # B
│   ├── matching/               # C
│   └── scheduling/             # C
├── tests/unit/
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

1. 认证方式、凭证传递和退出失效机制；保护操作遵守未登录 `401` 或跳转登录、角色/所有权错误 `403`、允许访问但对象不存在 `404` 的约定。
2. 数据模型：`User`、`CandidateProfile`、`CompanyProfile`、`Job`、`Application`、`InterviewSlot`、`Booking`，以及技能存储和时区策略。
3. 唯一约束：账号标识、`Application(candidate_id, job_id)`、`Booking.slot_id`、`Booking.application_id`。
4. API 请求字段、响应字段、错误码及公共服务函数。数据库模型和迁移变更提前通知队友。

以下是接口范围草稿，正式路径与字段确认后写入 `SPEC.md`：

| 负责人 | API 范围草稿 |
|---|---|
| A | `/api/auth/`、`/api/candidate/profile/`、`/api/candidate/resume/` |
| B | `/api/jobs/`、`/api/applications/`、`/api/employer/` |
| C | `/api/slots/`、`/api/bookings/`，以及后端共享匹配函数 |

建议共享服务：`calculate_match_score(candidate_skills, required_skills)`、`apply_to_job(candidate, job_id)`、`update_application_status(employer, application_id, status)`、`book_interview(candidate, application_id, slot_id)`。

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

完整启动流程将在 [INSTALL.md](INSTALL.md) 中维护，包括依赖版本、前后端启动、数据库迁移、重置/seed、测试、Docker 构建与依赖启动命令。该文件当前仍为模板，项目尚无可用的完整应用启动流程。

第一天需统一并锁定 Python、Node.js、前后端依赖及数据库版本；确认认证和 API 契约，并完成 React → API → 数据库的实际联通。

## Demo Accounts

演示账号尚未生成。seed 完成后在此记录明确标为 local/demo 的账号及密码；不要填写真实账号或个人数据。

一个文档化命令应能重置并生成：至少两个求职者、两个雇主、两个有技能要求的岗位，100/50/0/空岗位技能得分 100 的四种例子，四种申请状态，以及两个可争抢同一可用时段的 `Interviewing` 求职者。

## Running Unit Tests

课程模板现有测试目录的调用方式为：

```bash
python -m pytest tests/unit -v
```

当前测试函数均为 `pass` 占位，即使显示通过也不证明业务正确。先实现实际业务与测试断言，再以测试结果作为证据。技术栈落地时统一完整测试命令并同步更新此处、CI 和 `INSTALL.md`；失败必须返回非零退出码。

覆盖成功、输入校验、权限和冲突情形，特别检查 `401/403/404`、技能归一化与两端同分排序、越权、SQL 绑定值、XSS 转义及预约冲突。课程只要求单元测试；数据库原子性仍需通过实现和运行环境验证。

## Requirement–Test Mapping

**以下是实施与验证计划，所有列出的现有测试仍为占位。** `backend/` 路径是规划中的实现位置；完成后补充实际文件和真实具名测试，不将占位或计划视为已通过。

| Requirement ID | 负责人 / 行为 | 实现文件或位置（规划） | Unit test(s) / verification evidence（待完成） |
|---|---|---|---|
| FP-ARCH-1 | 全员：浏览器、后端、关系型数据库 | `frontend/`、`backend/`、`Dockerfile` | 干净 checkout 的完整构建、启动与浏览器演示 |
| FP-AUTH-1 | A：注册、登录、退出、唯一标识 | `backend/accounts/` | `tests/unit/test_auth.py::test_fp_auth_1_registration_and_session_lifecycle`；`test_fp_auth_1_invalid_registration`（同文件） |
| FP-AUTH-2 | A：密码哈希、秘密不外泄 | `backend/accounts/` | `tests/unit/test_auth.py::test_fp_auth_2_salted_hash_and_password_verification`；补充秘密不外泄断言 |
| FP-AUTH-3 | A 牵头，全员：角色、所有权、缺失对象 | 各模块权限逻辑 | `tests/unit/test_auth.py::test_fp_auth_3_authorization_and_missing_object` |
| FP-CAN-1 | A：资料、技能、私有简历 | `backend/candidates/` | `tests/unit/test_workflows.py::test_fp_can_1_profile_and_private_resume_rules` |
| FP-CAN-2 | A/C：全部岗位、分数和排序 | `backend/candidates/`、`backend/matching/` | `tests/unit/test_workflows.py::test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs` |
| FP-CAN-3 | A/B：申请、防重复、本人查询 | `backend/applications/` | `tests/unit/test_workflows.py::test_fp_can_3_pending_duplicate_and_application_owner` |
| FP-EMP-1 | B：公司资料 | 雇主资料模块（具体位置待定） | `tests/unit/test_workflows.py::test_fp_emp_1_company_profile` |
| FP-EMP-2 | B：岗位校验、所有权、删除冲突 | `backend/jobs/` | `tests/unit/test_workflows.py::test_fp_emp_2_job_validation_and_deletion` |
| FP-EMP-3 | B/C：申请人信息、排序、状态权限 | `backend/applications/`、`backend/matching/` | `tests/unit/test_workflows.py::test_fp_emp_3_applicant_fields_order_status_and_role` |
| FP-MATCH-1 | C：固定公式、归一化、同分规则 | `backend/matching/` | `tests/unit/test_matching.py::test_fp_match_1_examples_normalization_and_floor`；`test_fp_match_1_both_tie_breakers`（同文件） |
| FP-MATCH-2 | 可选 AI 增强 | N/A，当前未计划实现 | N/A；实现后新增数据流说明和具名单元测试 |
| FP-SCHED-1 | C：未来 30 分钟时段及删除 | `backend/scheduling/` | `tests/unit/test_scheduling.py::test_fp_sched_1_slot_creation_timezones_and_deletion`；`test_fp_sched_1_invalid_slots`（同文件） |
| FP-SCHED-2 | C：预约资格、可见性、状态变更后保留 | `backend/scheduling/` | `tests/unit/test_scheduling.py::test_fp_sched_2_eligible_booking`；`test_fp_sched_2_ineligible_booking`（同文件）；补充已有预约保留断言 |
| FP-SCHED-3 | C：数据库原子性与冲突合同 | `backend/scheduling/`、约束/迁移 | `tests/unit/test_scheduling.py::test_fp_sched_3_conflict_contract`；另检查真实数据库原子性 |
| FP-SEC-1 | 全员：对象访问与越权边界 | 各模块权限逻辑 | 扩展认证、求职者、雇主和预约测试，验证代表性越权场景 |
| FP-SEC-2 | 全员：参数化查询/安全 ORM | 各模块数据库访问 | 待编写 SQL 元字符保持绑定值的具名测试 |
| FP-SEC-3 | 全员：用户内容安全渲染 | React 渲染与后端输出 | 待编写 `<script>alert(1)</script>` 不成为可执行标记的具名测试 |
| FP-SEC-4 | 全员：秘密、个人数据、测试隔离 | 配置、`.env.example`、测试 fixtures | 仓库检查、隔离测试库和第三方服务替身证据 |
| FP-PROC-1 | 全员：规格与实际代码一致 | `SPEC.md` | 逐模块审查规格，确认成员能够解释与修改代码 |
| FP-DOC-1 | A 牵头：安装可复现 | `INSTALL.md`、`Dockerfile` | 由未搭建环境的成员按文档完成干净安装 |
| FP-DOC-2 | B 牵头：完整 README 与映射 | `README.md` | 逐项核对概览、架构、账号、测试、文档和全部需求映射 |
| FP-DOC-3 | B 牵头：确定性重置和 seed | seed 命令与 fixtures（待建立） | 验证人数、岗位、四种匹配/状态及同槽竞争演示数据 |
| FP-TEST-1 | 全员：实际业务单元测试与完整命令 | `tests/unit/`、CI 配置（待建立） | 替换全部占位，覆盖每项功能及规定安全/冲突案例 |
| FP-SUB-1 | 全员：确切 main commit 与完整 Docker 环境 | Git、`Dockerfile`、`INSTALL.md` | 在提交 commit 验证构建、依赖启动、迁移、seed、测试与 UI |

## Document Index

| 文档 | 用途 | 当前状态 |
|---|---|---|
| [README.md](README.md) | 项目概览、分工、启动计划与需求映射 | 开发规划，随实现更新 |
| [SPEC.md](SPEC.md) | 架构、模型、权限、API、匹配、预约事务与安全设计 | 课程模板，待补全 |
| [INSTALL.md](INSTALL.md) | 精确安装、启动、迁移、seed、测试和 Docker 指令 | 课程模板，待补全 |
| [Dockerfile](Dockerfile) | 完整运行环境的构建入口 | 课程模板，待配置真实应用 |
| [课程项目页](https://sra-research.github.io/CSC4801/project.html) | 课程项目与审计安排 | 结合教师公布的最新要求核对 |

## Known Limitations

- 当前尚无 React/Python 业务应用，规划目录与 API 尚未建立。
- 现有 `requirements.lock` 是带 Flask 的课程示例依赖，尚未改为计划中的 Django/DRF 技术栈。
- `Dockerfile` 的启动命令会报告模板未配置；尚不能启动完整平台。
- `SPEC.md`、`INSTALL.md`、演示账号和 seed 流程尚未完成；单元测试仍是占位。
- 三名成员的 A/B/C 职责对应、具体版本、认证方式、完整 API 与数据库设计待共同确认。
