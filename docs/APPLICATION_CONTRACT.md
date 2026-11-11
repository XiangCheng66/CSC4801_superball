# 求职者投递与本人申请（A / Day 3）

完成 FP-CAN-3。沿用 Session Cookie、CSRF、`{data: ...}` 成功响应和公共错误结构。不新增依赖、数据库字段或迁移，不要求重置已有账号。

## 接口

| 方法 | 路径 | 输入 | 成功 |
|---|---|---|---|
| POST | `/api/applications/` | `{"job_id": 10}` | 201；新建的本人申请，状态为 Pending |
| GET | `/api/applications/` | 无查询参数 | 200；本人全部申请，按创建时间降序、整数申请 ID 降序 |
| GET | `/api/applications/<application_id>/` | 无 | 200；仅本人申请详情 |

`job_id` 必须是 1～2^63−1 的 JSON 整数，拒绝布尔值、小数、字符串、数组和对象。只接受这个字段；`candidate_id`、`status`、`role`、`booking` 等均返回 400。所有者来自当前会话，状态来自模型的 Pending 默认值。列表不接受指定他人或状态的查询参数，不分页、不截断。

响应示例：

```json
{"data":{"id":12,"job":{"id":10,"title":"Backend","employer_id":3,"company":"Superball Labs","description":"Build services","required_skills":["Python","SQL"]},"status":"Pending","booking":null,"created_at":"2026-11-03T12:00:00Z","updated_at":"2026-11-03T12:00:00Z"}}
```

有预约时，`booking` 为 `{"id":23,"slot_id":45,"start_at":"2026-11-04T01:00:00Z","end_at":"2026-11-04T01:30:00Z"}`。输出使用 UTC；页面复用 C 的时间工具，显示北京时间（UTC+8）。预约从现有 Booking/InterviewSlot 读取，申请状态后来离开 Interviewing 也不隐藏关联。当前接口不创建预约，不替代 C 的预约资格和并发服务。

岗位信息读取当前 Job 及公司资料；公司缺失时依次回退到雇主显示名称、用户名。使用显式字段白名单，不输出候选人简历、密码或会话信息；预加载岗位、雇主、公司、预约/时段和岗位技能，避免逐条查询。

## 权限与错误

| 情况 | HTTP / code |
|---|---|
| 未登录 | 401 `not_authenticated` |
| Employer 调用这些求职者接口 | 403 `permission_denied` |
| Candidate 用他人的申请 ID 读取或尝试写入 | 403 `permission_denied`，不返回申请内容 |
| 可访问角色下不存在的岗位或申请 | 404 `not_found` |
| 请求字段或类型非法、未知查询参数 | 400 `validation_error` |
| 写请求 CSRF 缺失/不匹配 | 403 `csrf_failed` |
| 同人同岗位重复投递（任何现有状态） | 409 `application_conflict`，原申请和状态保持不变 |
| 本人对详情 PUT/PATCH/DELETE | 405 `method_not_allowed`，不支持自行改状态或撤销 |

认证、角色和 CSRF 检查使用公共基础；详情先查对象与所有权，再处理 HTTP 方法。查询列表始终按会话候选人过滤，修改 URL 或正文不能切换身份。

## 共享写入服务与 B/C 接入

`applications.services.apply_to_job(candidate, job_id)` 是唯一投递写入实现。服务自身也检查登录与 Candidate 角色，在事务内锁 Job、检查已有申请并创建 Pending 申请。数据库已有 `applications_unique_job_candidate` 唯一约束作最终防重保护；捕获 IntegrityError 时在事务回滚后确认重复记录，再返回 409，不吞掉无关数据库故障。

同一岗位上的创建在 PostgreSQL 下由行锁串行化；唯一约束防止不配合加锁的其他写入产生第二条申请。申请的 Job 外键 PROTECT 保留 B 的删除保护：产生申请后删除岗位返回 409，数据不变。SQLite 仍依靠数据库唯一约束，生产/演示使用 PostgreSQL。

雇主申请人查询与状态变更复用 Application 模型。预约成功后，本人申请响应从同一个 Booking 记录读取预约信息。字段与权限见 [申请人契约](APPLICANT_CONTRACT.md) 和 [预约契约](BOOKING_CONTRACT.md)。

## 页面与验证

岗位推荐加载岗位和本人申请；已有申请显示实际状态，其他岗位可投递。提交期间禁用按钮并用 ref 阻止重复事件。409 后重新读取最新状态，404 提示刷新岗位，网络失败保留手动重试，401 回到登录。写请求不会自动重试。

“我的申请”展示本人全部岗位、公司、四种状态和已有预约；支持加载、失败重试、空列表、刷新和手机布局。切换入口时重新查询，保留资料与简历草稿。所有用户文字使用 React 文本节点。

验收测试：`tests/unit/test_applications.py`、`test_workflows.py::test_fp_can_3_pending_duplicate_and_application_owner`、`frontend/src/pages/candidate/CandidateWorkspace.test.jsx` 和 `frontend/e2e/applications.spec.js`。完整命令见 INSTALL.md。
