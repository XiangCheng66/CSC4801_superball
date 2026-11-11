# C Day 3：预约接口与事务契约

实现 FP-SCHED-2/3，复用现有 Booking、InterviewSlot、Application；没有新数据库字段或迁移。所有接口使用已有 Session Cookie、CSRF、严格 JSON 字段和 `{data: ...}` / `{error: ...}` 包装。列表为完整数组，按时段时间、预约 ID 排序，不截断。未知查询参数拒绝。

## API

| 方法 | 路径 | 权限与结果 |
|---|---|---|
| GET | `/api/booking-applications/` | Candidate：本人 Interviewing 且无预约的申请选项 `{id, job_id, job_title}`，按申请 ID 排序 |
| GET | `/api/booking-applications/<application_id>/slots/` | Candidate：本人合资格申请的同雇主未来未预约时段；字段沿用 SlotSerializer |
| POST | `/api/bookings/` | Candidate + CSRF：`{application_id, slot_id}`；成功 201 |
| GET | `/api/bookings/` | Candidate 仅本人申请的预约；Employer 仅本人时段的预约；200 |
| GET | `/api/bookings/<booking_id>/` | 同上所有权；200 |

写入 ID 必须为 1～2^63−1 的 JSON 整数，不接受布尔、小数、字符串或未知字段。取消/更改预约不是本次范围，PUT/PATCH/DELETE 不支持。

预约响应仅含 `id/application_id/slot_id/job_id/job_title/candidate_name/employer_id/start_at/end_at/created_at`。job 是申请的岗位，slot 可以属于同雇主另一岗位；不输出简历、邮箱、密码或会话。时间为 UTC，页面复用 C 的北京时间工具。

## 资格与错误

申请必须属于当前 Candidate，状态为 Interviewing；时段必须属于申请岗位的雇主且开始严格在未来；申请和时段都不能已有预约。同雇主不同岗位允许预约。

- 未登录 401；角色不符或他人申请/预约、不同雇主的时段 403；对象不存在 404。
- 不合法输入 400；CSRF 缺失 403。
- 时段已占用：409 `slot_already_booked`，精确消息 `Slot already booked`。
- 申请已有预约：409 `application_already_booked`。
- 申请不再 Interviewing 或时段已开始：409 `booking_ineligible`。
- 权限先于冲突校验；写入中时段占用优先于申请重复、状态/时间校验。失败不改变任何记录。

## 数据库原子性

`booking_services.create_booking` 自身验证 Candidate 角色。在 `transaction.atomic()` 中依次 `SELECT FOR UPDATE` 锁 Application、InterviewSlot，锁只覆盖主表，避开可空外连接。取得两把锁后重新检查资格；同一申请竞争不同的时段会在申请行串行化，不同申请竞争同一时段会在时段行串行化。

Booking 两个 OneToOne 唯一约束提供最终保护。IntegrityError 仅在事务回滚后，确认实际已有 slot/application 预约时映射 409；其他数据库错误继续抛出。雇主删除时段使用相同的时段行锁和 PROTECT，因此不能删除已预约时段。

B 的状态更新会获取 PostgreSQL 写行锁，与此处申请行锁串行化。预约先成功而状态随后改变时保留预约；状态先改变时预约读取最新状态并拒绝。不得因状态离开 Interviewing 删除或隐藏已有预约。

## 页面及 A/B 集成

`BookingPanel` 为两种角色共享组件。求职者从“面试预约”选择合资格申请和同一雇主的时段，提交后可查看预约。雇主工作台显示收到的预约。

面板支持加载、失败重试、无申请/无时段/无预约、401、409 自动刷新及输入切换时丢弃旧响应。ref 同步拦截重复点击，写请求不自动重试。所有用户文本使用 React 文本节点。

“我的申请”和雇主申请人列表读取同一个 Booking 记录，返回 `booking: {id, slot_id, start_at, end_at}`。完整联调由 `frontend/e2e/hiring-flow.spec.js` 覆盖。

## 验证

`tests/unit/test_booking.py` 替代原预约占位，覆盖成功、资格/权限/CSRF、非法 ID、精确冲突消息、状态改变后保留、失败无部分写入、未知数据库异常不误报，以及 PostgreSQL 双连接竞争（同一时段、同一申请两种情况）。SQLite 跳过两项行锁测试，CI 的 PostgreSQL 会执行它们。

前端 `BookingPanel.test.jsx` 验证提交、重复点击、409、错误重试、空态、401、雇主只读和旧响应丢弃。`frontend/e2e/booking.spec.js` 在刚执行 `seed_demo` 的隔离演示库验证双候选人竞争、刷新持久化、跨用户拒绝、雇主可见、北京时间和手机布局。该浏览器用例会产生真实预约，重跑前应重置其专用演示库；不要清空个人数据库。
