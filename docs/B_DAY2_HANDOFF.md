# B 第二天交接

范围（README 第一周计划 Day 2–3）：公司资料、岗位管理。对应 `FP-EMP-1` 与 `FP-EMP-2` 的 HTTP 接口、前端页面和真实测试。申请人与状态修改（`FP-EMP-3`）仍留给 Day 4–5。

分支 `feat/b-day2-employer-api`，基于 `main@a12e4fe`（三人第一天已合并）。

## 已交付

后端：

- `backend/employers/serializers.py`、`views.py`、`urls.py`：`GET/PUT /api/employer/company/`。
- `backend/jobs/serializers.py`、`views.py`、`urls.py`：`GET/POST /api/employer/jobs/`、`GET/PATCH/DELETE /api/employer/jobs/<id>/`。
- `backend/common/errors.py`：新增 `JobHasDependents`（409，`job_has_dependents`），沿用 A 的错误封装。
- `backend/config/urls.py`：注册两条 include，位于 API 404 兜底之前。

前端：

- `frontend/src/api/employer.js`：六个调用封装，全部走 `apiRequest`。
- `frontend/src/pages/employer/EmployerWorkspace.jsx`：公司资料表单、发布岗位、行内编辑、删除；404 视为"尚未创建公司资料"。
- `frontend/src/App.jsx`：`role === 'Employer'` 渲染工作区，其余角色仍走 `AccountHome`。
- `frontend/src/pages/employer/EmployerWorkspace.test.jsx`：10 项组件测试。

## 接口契约

| 方法 | 路径 | 成功 | 失败 |
|---|---|---|---|
| GET | `/api/employer/company/` | 200 `{company_name, description, updated_at}` | 401 / 403 / 404 未创建 |
| PUT | `/api/employer/company/` | 201 新建 / 200 覆盖 | 400 空或纯空白 |
| GET | `/api/employer/jobs/` | 200 数组，仅本人岗位 | 401 / 403 |
| POST | `/api/employer/jobs/` | 201 | 400 |
| GET | `/api/employer/jobs/<id>/` | 200 | 401 / 403 他人岗位 / 404 不存在 |
| PATCH | `/api/employer/jobs/<id>/` | 200，只改传入字段 | 400 / 403 / 404 |
| DELETE | `/api/employer/jobs/<id>/` | 200 `{deleted: true, id}` | 409 `job_has_dependents` 有申请或时段 |

请求字段：`title`（≤200）、`description`、`required_skills`（字符串数组，可省略，可空数组）。`employer`、`id` 等未知字段一律 400——沿用 A 的 `StrictSerializer`。

技能处理：去首尾空白、丢弃空项、大小写不敏感去重且保留首次拼写（`["Python", " python "]` → `["Python"]`）。数据库 `UNIQUE (job_id, LOWER(name))` 仍是最终防线。

## 设计要点

1. **公司资料没有 URL 中的 ID**：主键就是当前账号，`/api/employer/company/` 天然不可能指向别人的公司，"猜 ID 越权"这一类攻击面不存在。
2. **岗位列表永远按 `request.user` 过滤**，`employer` 字段拒绝客户端传入，无法替别人创建岗位。
3. **删除用 `PROTECT` + 捕获 `ProtectedError`**：409 来自数据库拒绝，而不是"先数一下再删"，并发下不会漏。事务回滚后岗位与申请都保持原样，测试里逐条断言了。
4. **PATCH 只在传入 `required_skills` 时整体替换技能**，避免"改标题顺手清空技能"。

## 验证证据

后端（本机 SQLite 内存测试库）：

```powershell
.venv\Scripts\python.exe -m pytest tests/unit -q
# 119 passed, 9 skipped
```

新增 44 项 `tests/unit/test_employer_api.py`，覆盖：未登录 401、角色 403、他人岗位 403、不存在 404、空/纯空白字段 400、未知字段 400、空白 trim、技能去重与空数组、PATCH 部分更新、删除 409 与数据不变、写接口 CSRF、SQL 元字符按字面存储。

前端：

```bash
cd frontend && npm test   # 3 files, 23 passed
npm run build             # 通过
```

`App.test.jsx` 补了 `./api/employer` 的 mock——雇主角色现在渲染工作区，原有用例需要该模块可被替换，断言未改。

端到端（Playwright + 本机 Edge，`APP_URL` 默认 5173，后端为 `runserver` + SQLite）：

```bash
cd frontend
PLAYWRIGHT_EXECUTABLE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  npx playwright test e2e/employer.spec.js
# 2 passed
```

用例覆盖：登录 → 保存公司资料 → 发布岗位（技能 `Python, SQL, python` 落库为 `Python、SQL`）→ 行内改标题与技能 → 删除 → 列表清空；手机视口 390px 无横向溢出。截图在 `frontend/test-results/`（已 gitignore）。

`runserver` 下的接口冒烟（16 步，含 401/403/404/400/409）：公司资料未创建 404、创建 201、覆盖 200、空名称 400、岗位列表只含本人、PATCH 只改传入字段、删除无申请岗位 200、删除有申请岗位 409 且数据不变、求职者访问 403、匿名 401。

## 尚未完成

- `FP-EMP-3`：申请人列表、按匹配分排序、四态修改（依赖 A 的候选人资料与投递数据）。
- 岗位删除的"面试时段"依赖：等 C 的 `InterviewSlot` 挂到 `Job` 并设 `PROTECT` 后自动生效，代码无需改动。
- 公司资料尚未在候选人推荐列表中展示（A 的 `FP-CAN-2` 页面读取 `employer.company_profile`）。
- 完整业务 seed（`FP-DOC-3`）等申请与预约落地后一次写。
- `styles.css` 新增了 `.workspace-layout`、`.job-list`、`.row-actions` 和 `h3` 四条规则。A 的候选人工作区若也要用 `workspace-layout`，合并时保留同一份定义，不要并存两套。

## 本次未验证

本机 Docker Desktop 未运行，第二天改动没有重新构建镜像，也没有在 PostgreSQL 上跑。上述证据来自 SQLite 隔离测试库与本地 `runserver` + Vite。第一天已在 compose 容器内验证过 PostgreSQL 17 上的全部约束；第二天只新增视图与序列化器，不改变数据库语义，但仍建议在合并前用 `docker compose build && docker compose up -d` 复验一次。
