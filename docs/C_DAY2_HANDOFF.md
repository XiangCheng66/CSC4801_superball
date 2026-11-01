# C 第二天交接 — 雇主面试时段

负责人：JeRant。范围为 FP-SCHED-1 的雇主时段管理，包含前后端、数据库、测试与文档。实现位于 `feat/c-day2-availability`，基于 `main` 的 `a12e4fe`（A/B/C Day 1 已合并）。未合并 A 的 `feat/a-day2-candidate-profile`，未改动 A/B 既有领域模型、迁移或依赖锁文件。

## 已实现

- `backend/scheduling/models.py` 和 `migrations/0001_initial.py`：时段关联 B 的 Job，通过其 employer 派生唯一所有者；数据库限制恰好 30 分钟；有关联时段的岗位不能删除。
- `services.py`：独立的服务层权限、所有权、未来时间、时长校验；创建/删除事务与行锁。只有自己的未来未预约时段可以删除。
- `serializers.py/views.py/urls.py`：创建、列表、可用筛选、详情、删除，以及仅本人岗位的选择接口；复用 A 的会话、CSRF、JSON 和错误契约。
- 最小 `Booking` 存储：slot/application 唯一关联及 PROTECT，使已预约排除/删除保护能用真实数据库记录验证；状态改变不会释放已有预约。这不是完整的预约服务。
- `frontend/src/pages/scheduling/` 和 `api/scheduling.js`：雇主时段表单、自动结束时间、列表、状态、删除确认、刷新与错误处理。挂载在 `AccountHome` 的 Employer 分支。
- 时间明确为数据库/API UTC、页面北京时间 Asia/Shanghai；API 拒绝没有时区的时间；浏览器所在地不改变表单含义。
- `seed_availability_demo`：保留的 employer1 演示岗位和北京时间明天两个时段，同一天可重复执行、不删除既有记录。
- 已同步 README 需求映射、SPEC、INSTALL 和 [时段契约](SCHEDULING_CONTRACT.md)。

## 验证记录（2026-11-01）

| 验证 | 结果 |
|---|---|
| Python 3.12，完整后端测试，隔离 SQLite | 119 passed，9 skipped |
| 同一测试套件，PostgreSQL 17 临时容器 | 119 passed，9 skipped |
| 单独时段测试 | 44 passed，3 skipped |
| Django check / 迁移遗漏检查 / pip check | 通过，无遗漏迁移、无依赖冲突 |
| Node 22 前端单元测试 | 23 passed（时段新增 10 项） |
| Vite 生产构建 | 通过 |
| 现有 Dockerfile 多阶段构建 | 成功；镜像内前端测试 23 passed 并成功构建 |
| 应用容器 + 独立 PostgreSQL 容器 | 自动 migrate、认证 seed、手动时段 seed 成功 |
| Chrome / Playwright，访问实际容器 | 5 passed（原认证 3 项、时段 2 项） |
| 桌面与 390px 手机截图 | 已目视检查；手机无横向溢出 |

时段后端测试覆盖正常创建/删除、时区转换、跨午夜、非法时长、过去时间、字段白名单、角色与跨雇主权限、CSRF、真实 Booking 的可用性与删除保护、申请状态变化、数据库 CHECK/唯一约束、岗位删除保护、seed 幂等。

浏览器时段测试以 `America/Los_Angeles` 时区运行，验证北京时间输入实际持久化为正确 UTC、刷新仍存在、确认删除、手机布局，以及 employer2 无法读取 employer1 的时段。截图位于被 Git 忽略的 `frontend/test-results/scheduling-desktop.png` 与 `scheduling-mobile.png`。

9 个 skipped 是尚未集成的 A/B 工作流 6 项与 C 的候选人预约/竞争 3 项，不是通过的课程需求。完整 Compose 干净启动流程尚未重跑；本次证据是现有 Dockerfile 构建和手工组成的隔离应用/数据库容器。远程 CI 需在提交推送后另行确认。

临时 PostgreSQL 数据存在 tmpfs；验证结束后删除本次临时应用、数据库容器及网络，没有修改已有演示数据库。本地构建镜像保留，可复用缓存。

## A/B 接入与演示

1. 按 [INSTALL](../INSTALL.md#c-day-2运行时段管理) 执行迁移和两个 seed，以 employer1 登录；新增时段界面位于账号信息下方。
2. B 的真实 Job 会自动出现在选择列表。C 的 `/api/slots/jobs/` 仅提供选择项，不实现 B 的岗位 CRUD。
3. B 的岗位删除接口需处理 `Job.interview_slots` 引起的 `ProtectedError` 并映射 409；申请变更状态不要删除关联 Booking。
4. A/B 将来整合工作台时，可复用 `AvailabilityPanel` 组件；候选人端不能调用当前 Employer 专用时段接口。
5. 合并 A Day 2 后再做候选人模块联调。当前分支不包含 A 未合入 main 的功能。

## 后续 C 工作

- 候选人可用时段查询、预约提交与双方授权的预约详情。
- 完整资格：申请属于本人、Interviewing、时段未来未预约、同一雇主、申请未预约；课程没有要求同一岗位。
- 原子预约服务：锁与唯一约束协作、事务回滚、竞争失败返回 409 和精确消息 `Slot already booked`，补齐具名测试。
- 与 A/B 的真实申请/状态流程联调，补齐完整演示 seed、审查和最终课程验收。

本次交付不包含 AI 功能，也不把预约表建立等同于 FP-SCHED-2/3 完成。
