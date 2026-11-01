# 演示数据（B / FP-DOC-3）

## 一条命令

```bash
python manage.py migrate --noinput
python manage.py seed_demo
```

`seed_demo` 先清空业务行、再重建固定数据集，因此可以在任何时刻重复执行，把本地演示库恢复成已知状态。

Compose：

```bash
docker compose exec -T app python manage.py seed_demo
```

`--no-reset` 只做增量补齐，不清库；用于不想丢掉当前手工数据的场景。

## 重置范围

按外键顺序删除，避免 `PROTECT` 拦截：

```
Booking → InterviewSlot → Application → Job(+RequiredSkill) → CompanyProfile → CandidateProfile → e2e_ 前缀账号
```

保留：`django_migrations`、`session` 之外的普通账号会被 `e2e_` 规则清理；五个保留演示账号会被重建并重置密码。

## 数据集

账号（密码 `LocalDemo!2026`，邮箱 `<username>@example.test`）：

| 账号 | 角色 | 技能 |
|---|---|---|
| `candidate1` | Candidate | python, sql |
| `candidate2` | Candidate | python |
| `candidate3` | Candidate | rust |
| `employer1` | Employer | — |
| `employer2` | Employer | — |

公司：`Superball Labs`（employer1）、`Northwind Studio`（employer2）。

岗位：

| 标题 | 雇主 | 要求技能 |
|---|---|---|
| `[Local demo] Interview availability` | employer1 | 无 |
| `[DEMO-A2] Backend Developer` | employer1 | Python, SQL |
| `[DEMO-A2] Generalist` | employer1 | 无 |
| `[Local demo] Data Analyst` | employer2 | Python, SQL |

申请（覆盖四种状态）：

| 候选人 | 岗位 | 状态 |
|---|---|---|
| candidate1 | Backend Developer | `Interviewing` |
| candidate3 | Backend Developer | `Interviewing` |
| candidate2 | Generalist | `Pending` |
| candidate1 | Generalist | `Accepted` |
| candidate2 | Data Analyst | `Rejected` |

时段：`[Local demo] Interview availability` 下，北京时间明天 09:00 与 09:30，各 30 分钟，均未预约。

## 四种匹配样例

对 `[DEMO-A2] Backend Developer`（要求 Python, SQL）：

| 候选人 | 技能 | 得分 |
|---|---|---:|
| candidate1 | python, sql | 100 |
| candidate2 | python | 50 |
| candidate3 | rust | 0 |
| 任意候选人 | 对 `[DEMO-A2] Generalist`（要求为空） | 100 |

## 预约竞争数据

candidate1 与 candidate3 的申请状态都是 `Interviewing`，且都属于 employer1。明天 09:00 的时段未被占用，两个申请都满足 FP-SCHED-2 的资格条件，可用于演示"两人抢同一时段，只有一个成功"。

`seed_demo` **不创建 Booking**：一旦写入预约，该时段就不再可用，竞争演示失效。

## 稳定性契约

岗位标题和公司名是浏览器测试的定位依据（`frontend/e2e/*.spec.js` 按 heading 或 option 文本查找）。修改 `seed_demo` 里的标题必须同步 e2e，否则会出现"代码对、测试红"的假故障。

`frontend/e2e/scheduling.spec.js` 已经从精确标题改为按 API 返回的岗位 ID 选择，再用自己的岗位集合校验选项，因此只依赖"存在一个包含 `Interview availability` 的岗位"这一较弱约定。

## 与其他 seed 命令的关系

| 命令 | 行为 |
|---|---|
| `seed_demo` | **主入口**。重置 + 全量演示数据 |
| `seed_auth_demo` | 只维护四个认证账号，不清库 |
| `seed_candidate_demo` | 增量补 candidate3、技能、两家公司、两个 `[DEMO-A2]` 岗位 |
| `seed_availability_demo` | 增量补 employer1 的两个时段 |

日常开发、浏览器测试、评审复现统一用 `seed_demo`；其余三条保留为增量工具。

## 验证证据

- `tests/unit/test_seed_demo.py`（7 项）：数据集完整性、四种匹配样例、两个 `Interviewing` 候选人同属一个雇主的开放时段、时段为未来 30 分钟且落在北京时间 09:00/09:30、可重复执行、清理 `e2e_` 账号、`--no-reset` 保留无关行。
- 容器内（PostgreSQL 17）：`seed_demo` 执行成功；`pytest tests/unit` 225 passed / 5 skipped（SQLite 与 PostgreSQL 测试库各一次）。
- Playwright 对容器实例（`APP_URL=http://127.0.0.1:8000`）：10 passed。
