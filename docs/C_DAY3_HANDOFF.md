# C Day 3 交接：候选人预约与原子冲突

负责人 JeRant；分支 `feat/c-day3-booking`，基于 `main@e777db0`。2026-11-08 完成。本次实现 FP-SCHED-2/3，不引入新依赖、数据库表、字段或迁移。

## 交付

- `backend/scheduling/booking_services.py`：候选人权限与申请所有权、同雇主（允许不同岗位）、Interviewing、未来时间、无预约校验；固定 Application→InterviewSlot 锁顺序；事务与唯一约束；精确 409 `Slot already booked`。
- `booking_views.py/urls.py`：可预约申请选项、可用时段、创建预约、双方按所有权过滤的列表/详情；严格整数 ID、字段白名单、Session/CSRF。字段和错误详见 [预约契约](BOOKING_CONTRACT.md)。
- `frontend/src/pages/scheduling/BookingPanel.jsx`、`api/bookings.js`：候选人预约入口、雇主收到的预约；加载/空态/失败重试、401、409 刷新、重复点击保护、过期查询响应丢弃。显示北京时间。
- 求职者工作台增加“面试预约”标签；雇主 Dashboard 增加预约记录。不重复实现 A 的投递或 B 的改状态。
- `tests/unit/test_booking.py` 替换 3 个预约占位测试，保留 Day 2 时段测试。新增页面测试与浏览器预约测试。
- 更新 README、SPEC、INSTALL、API/时段契约。

## 验证结果

| 检查 | 结果 |
|---|---|
| 完整后端，隔离 SQLite | 262 passed，4 skipped |
| 完整后端，临时 PostgreSQL 17 | 264 passed，2 skipped |
| 前端单元测试 | 51 passed |
| 前端生产构建 | 通过；最终布局修正后 Docker 构建再次执行测试和打包 |
| Django check / 迁移遗漏 / pip check | 通过，无新迁移和依赖冲突 |
| 现有 Dockerfile | 构建成功，临时应用容器连接临时 PostgreSQL，自动迁移后 seed_demo 成功 |
| 真实 Chrome，完整浏览器回归 | 11 passed |
| 最终截图 | 候选人桌面/手机与雇主预约区域已检查，无横向溢出 |

PostgreSQL 两项真实双连接测试：不同申请争抢同一时段、同一申请争抢不同时段，均恰好一条成功、一条预期冲突、数据库只有一个 Booking。不是用 SQLite 或进程内锁模拟并发。

SQLite 跳过两项 PostgreSQL 行锁测试；其余两个 skip 是尚未合入的 A/B 投递与申请人工作流，不属于 C 预约功能。

浏览器验证两位候选人同时看到可用时段，一方预约后另一方收到 409 提示；刷新仍显示预约、其他候选人不能读取、雇主能看到。预约截图在 Git 忽略的 frontend/test-results；最终布局截图为 booking-mobile-review.png、booking-desktop-review.png、booking-employer-review.png。本次临时容器/网络在验证后清理；现有个人数据库未变更。

## 集成边界

A Day 3 PR #6 和 B 的 `feat/b-day3-applicants` 在实施时尚未合入主线，本次不自动合并它们。C 页面通过独立的申请选项接口读取现有 Application，所以 main 的 seed_demo 数据即可完成预约验收。

A/B 分支均已从现有 Booking 表读取 `{id, slot_id, start_at, end_at}`，将来合并后可以展示本次创建的记录。完整“新投递→雇主改 Interviewing→预约”页面链路需在 A/B 合入后再做集成回归；目前已用真实申请数据验证预约全流程。

后续合并关注 CandidateWorkspace 的标签入口、EmployerDashboard 的嵌入位置、公共 CSS、URL include 和文档冲突。保留同一套预约服务，不复制预约写入；申请状态改变不能删除已有 Booking。

## 本地复现

按 INSTALL 启动，专用演示库 migrate 后执行 seed_demo。candidate1 和 candidate3 可预约 employer1 的时段，公开演示密码 LocalDemo!2026。seed_demo 默认重置业务表，只在独立演示库使用。

上述为提交前的本地验证记录；远程 CI 结果以本次提交在 GitHub Actions 的实际运行结果为准。本地 Docker/浏览器验证不等于远程 CI 已通过。
