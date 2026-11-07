# 雇主申请人管理与状态修改（B / Day 4–5）

完成 `FP-EMP-3`。复用 `applications.Application` 与 `matching` 的共享排序，不新增模型、字段或迁移。

## 接口

| 方法 | 路径 | 输入 | 成功 |
|---|---|---|---|
| GET | `/api/employer/jobs/<job_id>/applicants/` | 无 | 200；该岗位全部申请人，按匹配分降序 |
| PATCH | `/api/employer/applications/<application_id>/status/` | `{"status": "Interviewing"}` | 200；更新后的同一行 |

申请人行：

```json
{
  "id": 12,
  "candidate_id": 5,
  "display_name": "Demo Candidate 1",
  "skills": ["python", "sql"],
  "match_score": 100,
  "status": "Interviewing",
  "booking": {"id": 3, "slot_id": 9, "start_at": "2026-11-08T01:00:00Z", "end_at": "2026-11-08T01:30:00Z"},
  "created_at": "2026-11-03T12:00:00Z",
  "updated_at": "2026-11-03T12:00:00Z"
}
```

`booking` 无预约时为 `null`。时间一律 UTC，页面用 C 的 `formatTime` 显示北京时间。

## 字段白名单

身份、技能、匹配分、状态、预约，加上申请 ID 与两个时间戳。**不返回**简历正文、邮箱、密码哈希、会话信息、其他申请人的申请。`skills` 来自 `CandidateProfile.skills`，候选人未建资料时为空数组。

## 排序

`matching.rank_applicants(required_skills, applicants)`，与求职者端共用：

1. 匹配分降序；
2. 同分按候选人显示名（`casefold`）；
3. 再按候选人 User ID 升序。

岗位没有技能要求时全部 100 分，因此实际按名称与 ID 排序。`application_id` 作为额外键传入，`rank_applicants` 复制行时会保留它，用于把排序结果映射回 ORM 行。

## 权限与错误

| 情况 | HTTP / code |
|---|---|
| 未登录 | 401 `not_authenticated` |
| Candidate 调用任一接口 | 403 `permission_denied` |
| Employer 访问他人岗位的申请人列表 | 403 `permission_denied` |
| Employer 修改他人岗位下的申请 | 403 `permission_denied` |
| 岗位或申请不存在 | 404 `not_found` |
| 状态非法、缺字段、含未知字段 | 400 `validation_error` |
| CSRF 缺失 | 403 `csrf_failed` |

存在性先于所有权：不存在的申请返回 404，别人的申请返回 403，与 `FP-AUTH-3` 的三态一致。

## 与其他模块的边界

- **投递写入只有一套**：`POST /api/applications/` 与 `applications.services.apply_to_job` 归 A。B 只读 `Application`，不重复实现防重逻辑；数据库 `UNIQUE(job, candidate)` 仍是最终防线。
- **预约只读**：`booking` 从现有 `Booking`/`InterviewSlot` 读取。状态离开 `Interviewing` 后预约仍显示、时段仍不可用（`FP-SCHED-2`），B 不删除也不重建预约。
- **删除岗位**：有申请时 `ProtectedError → 409 job_has_dependents`，由第一天建立的 `PROTECT` 承担，本次未改动。

## 页面

`EmployerWorkspace` 每个岗位行新增"申请人"按钮，展开后：

- 每行显示显示名、匹配分、技能、面试时间（或"尚未预约面试"）；
- 状态下拉即时生效，失败保留原值并显示错误；
- 空列表显示"还没有人投递这个岗位。"；
- 快速切换岗位时用 `useRef` 丢弃过期响应，避免旧请求覆盖新面板。

## 验证证据

`tests/unit/test_employer_applicants.py`（21 项）：排序与两级并列规则、空技能岗位全员 100、行字段完整性、无简历/邮箱泄漏、三类角色的 401/403/404、四态修改、非法输入、跨雇主与候选人越权、修改不影响其他申请、预约可见且状态变化后保留。

前端 `EmployerWorkspace.test.jsx` 新增 6 项：列表渲染、空态、改状态、加载失败、折叠、面试时间按北京时间显示。
