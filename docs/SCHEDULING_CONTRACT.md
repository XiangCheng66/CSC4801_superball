# C / Day 2 — 面试时段契约

已实现 FP-SCHED-1 的雇主时段管理。C Day 3 已补充求职者预约、资格校验、双方详情与并发处理，见 [预约契约](BOOKING_CONTRACT.md)；下文描述 Day 2 时段接口。共用 [API 契约](API_CONTRACT.md) 的会话、CSRF、JSON 包装和 401/403/404 规则。

## 模型与所有权

- `scheduling.InterviewSlot`：`id`、`job`、`start_at`、`end_at`、`created_at`。一个时段属于一个 Job，唯一所有者由 `job.employer` 决定，不重复保存可冲突的 employer 字段。
- `job` 外键为 `PROTECT`，反向名 `interview_slots`。B 的岗位删除接口需捕获 `ProtectedError` 并返回 409；即使没有申请，只要有时段也不能删除该岗位。
- 数据库 CHECK 限制 `end_at = start_at + 30 minutes`。未来时间在服务层按请求时刻校验，不能用随时间自动失效的数据库 CHECK。
- `scheduling.Booking` 提供存储与保护，预约写入由 Day 3 booking_services 负责：`slot`、`application` 均为 OneToOne + PROTECT，及 `created_at`。一时段最多一个预约，一申请最多一个预约；预约不会随申请状态改变自动释放。
- 迁移 `scheduling.0001_initial` 依赖 B 的 `jobs.0001`、`applications.0001`，不改写队友的既有迁移。

## 时间与输入

数据库与 API 响应使用 UTC，`USE_TZ=True`。API 输入必须是带 `Z` 或明确 UTC offset 的 ISO 8601 字符串，拒绝没有时区的时间。雇主页面的输入、列表和结束时间预览统一为 **Asia/Shanghai（北京时间，UTC+8）**，不依赖浏览器所在时区。

开始时间必须严格晚于服务器当前时刻，结束时间必须恰好晚 30 分钟。UI 自动计算结束时间，后端独立验证；越过午夜、不同 offset 表示的同一绝对时间均按实际时间差计算。当前不限制重复或重叠时段，课程没有要求该限制。

## 已实现 API

以下接口均只允许已登录 Employer；POST/DELETE 还要求 CSRF。不存在返回 404，访问其他雇主的已存在对象返回 403。

| 方法 | 路径 | 结果 |
|---|---|---|
| GET | `/api/slots/jobs/` | 200；自己的岗位选项，`data: [{id, title}]`，按标题、ID 排序；不是 B 的岗位 CRUD |
| GET | `/api/slots/` | 200；自己的全部时段，包括已预约和历史时段；按开始时间、ID 排序 |
| GET | `/api/slots/?available=true` | 200；仅自己的未来且未预约时段；省略参数或 `false` 返回全部 |
| POST | `/api/slots/` | 201；创建时段；只接受 `job_id/start_at/end_at` |
| GET | `/api/slots/<id>/` | 200；自己的一个时段 |
| DELETE | `/api/slots/<id>/` | 200；删除自己的未来未预约时段，`data: {"message": "Slot deleted."}` |

列表 `data` 是数组，目前不分页。未知创建字段和列表查询参数返回 400；更新时段的 PUT/PATCH 不支持。

创建示例（示例日期需换成实际未来日期）：

```json
{"job_id": 1, "start_at": "2030-01-02T09:00:00+08:00", "end_at": "2030-01-02T09:30:00+08:00"}
```

响应示例：

```json
{"data": {"id": 1, "job_id": 1, "job_title": "Developer", "employer_id": 2, "start_at": "2030-01-02T01:00:00Z", "end_at": "2030-01-02T01:30:00Z", "is_booked": false, "is_available": true}}
```

`is_booked` 来自真实 Booking 关联；`is_available` 同时检查未来与未预约。管理列表显示已预约记录但不会标记为可预约。响应没有求职者资料、申请详情或简历。

| 错误 | HTTP / code |
|---|---|
| 非未来、非 30 分钟、无时区、非法字段 | 400 / `validation_error`，带 fields |
| 删除已有预约的时段 | 409 / `slot_booked`，`A booked slot cannot be deleted.` |
| 删除已经开始或结束的时段 | 409 / `slot_started`，`A past or started slot cannot be deleted.` |

删除事务锁定时段行并检查真实预约；外键 PROTECT 提供额外保护。创建事务锁定所属岗位行。Day 3 预约服务在事务中协调锁和唯一约束，捕获冲突并返回课程规定的 `409` / `Slot already booked`，详见预约契约。

## 前端接入

- `frontend/src/api/scheduling.js` 复用公共 `apiRequest`，自动携带会话与 CSRF。
- `frontend/src/pages/scheduling/AvailabilityPanel.jsx` 是 C 的雇主时段组件，当前挂载在 `AccountHome` 的 Employer 分支。A/B 可将该组件移动到未来工作台，无需复制逻辑。
- `time.js` 将北京时间输入转成 UTC，并进行日期有效性检查。页面展示 loading、无岗位/无时段、网络失败与重试、校验错误、会话失效、创建/删除成功提示。
- 删除有确认步骤；服务器发生 409 时保留记录并刷新，不假装删除成功。已预约或历史记录没有删除入口。

## A / B 后续接入

B 的真实 Job 创建后会自然出现在时段选项，无需新建第二套岗位模型。B 删除岗位应包含 `interview_slots` 关系的冲突映射，申请改状态不得删除预约。

A 的候选人端不能调用这些 Employer 专用接口。后续 C 需新增候选人可用时段/预约接口，验证申请属于本人、申请为 Interviewing、时段与申请属于**同一雇主**、时段未来未预约、申请没有预约。课程要求同一雇主，不额外要求同一岗位。还需提供双方授权的预约详情以及原子冲突测试。

## 本地演示数据

先 `migrate`、`seed_auth_demo`，再执行 `python manage.py seed_availability_demo`。它为保留演示账号 employer1 添加一个 `[Local demo] Interview availability` 岗位及北京时间明天 09:00、09:30 的两个时段；同一天重复执行不会重复添加，不删除已有记录，不创建虚假的候选人预约。

该命令仅用于本地演示，不是最终完整 seed/reset。跨天运行会补充新的未来时段并保留历史。已预约保护通过测试 fixture 中的真实 Booking 验证；候选人可通过 Day 3 面试预约入口提交合资格预约。
