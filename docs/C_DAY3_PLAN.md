# C Day 3 开发准备

准备日期：2026-11-08。本文为待实施计划，不代表预约功能已完成。

## 基线与当前状态

- 本地 main 已快进至远程 `e777db08845a35a653225ed9201c350ca1b64e35`。
- 从该主线新建 `feat/c-day3-booking`，保留原 C Day 2 分支。
- A/B/C Day 2 已全部合并，B 的完整演示数据 PR #5 也已合并。
- A Day 3：`feat/a-day3-applications`，PR #6 当前 OPEN；实现投递和本人申请列表。
- B Day 3：远程已有 `feat/b-day3-applicants`，实现申请人列表与状态修改；准备时尚未合入 main。
- 本次只读取 A/B Day 3 的代码与契约，没有合并他们的功能分支。

本机基线验证：后端 SQLite 隔离库 **225 passed / 5 skipped**，前端 **44 passed**，生产构建、Django check 与迁移遗漏检查通过。远程 main CI 成功。本次没有重跑本地 PostgreSQL/Docker/browser 验收，没有运行会清空业务数据的 `seed_demo`。

## Day 3 目标与实施顺序

1. **预约服务与真实单元测试**：在 `backend/scheduling/` 复用 InterviewSlot、Booking、Application。服务自身校验身份、所有权、状态、时刻与预约冲突。
2. **API**：新增候选人按本人申请查询可用时段、提交预约、本人预约列表/详情，以及雇主本人预约可见性。沿用 Session、CSRF、严格字段白名单、统一响应与 401/403/404。
3. **原子性**：预约写入从第一版就用事务，锁 Application 与 InterviewSlot，并使用既有 OneToOne 唯一约束兜底。固定锁顺序，等待锁后重新检查状态与未来时间；数据库异常在回滚后分类，不吞掉无关错误。
4. **页面**：在 `frontend/src/pages/scheduling/` 实现可复用预约组件，展示时段、提交结果和冲突。统一北京时间，API UTC；写请求不自动重试。
5. **联调与文档**：A/B Day 3 合入后，在他们的工作台接入组件，验证投递→Interviewing→预约→双方查看。更新需求映射、预约契约与交接记录。

先用 main 已有 Application 模型、隔离测试 fixture 和演示数据开发服务/API；完整页面入口联调需要 A/B Day 3 集成。不要重复实现 A 的投递或 B 的状态修改。

## 必须满足的业务规则

- 当前用户是 Candidate，且拥有申请。
- 申请为 Interviewing。
- 时段属于该申请岗位的雇主；**不要求时段与申请属于同一个岗位**。
- 时段开始严格晚于服务器当前时间，且未预约。
- 申请没有已有预约。
- 不合资格或冲突时，不产生任何部分写入。
- 竞争同一时段恰好一人成功，失败方返回 HTTP 409，消息精确为 `Slot already booked`。
- 同一申请竞争不同的时段，也最多产生一个预约。
- 申请后来离开 Interviewing，已有预约仍保留、可见，时段仍不可用且不可删除。

## 接口依赖与集成位置

A 分支的 `docs/APPLICATION_CONTRACT.md` 已提供 `/api/applications/` 及详情；其 `booking` 读模型为 `{id, slot_id, start_at, end_at}` 或 null。A 的 `Applications.jsx` 是后续预约入口的接入点。

B 分支的 `docs/APPLICANT_CONTRACT.md` 已提供申请人列表、状态修改，并读取同样的 booking 字段。其 `EmployerWorkspace.jsx` 展示已有面试时间；当前主线的 `EmployerDashboard.jsx` 已组合岗位管理与时段管理，C 不应重新挂载一套账号/雇主页面。

预约服务需锁 Application 行，和状态更新形成数据库上的串行顺序；集成 B 代码时验证预约与改状态同时发生的行为。已预约后的状态变化不能触发删除预约。

`seed_demo` 已有 candidate1/candidate3 的 Interviewing 申请和同一雇主的开放时段，适合竞争验收。该命令默认重置业务表，验收仅在独立临时数据库运行，不在现有个人数据上直接运行。

## 验收清单

- 成功预约、全部资格拒绝、跨用户/跨雇主越权、CSRF、未知字段与非法 ID。
- 同雇主不同岗位成功；其他雇主失败；无简历或秘密字段泄漏。
- 409 冲突、同申请重复预约、失败回滚、状态变化后保留与双方可见。
- PostgreSQL 验证事务/约束，必要时运行同步双连接竞争测试；SQLite 通过不等同于并发验证。
- React 加载/空态/错误/401/409/重复点击测试，桌面与手机浏览器完整流程。
- 保留并运行现有时段、岗位删除保护、匹配和认证回归测试。

实现完成后再提交、推送和检查远程 CI；本准备阶段不改变现有业务代码。
