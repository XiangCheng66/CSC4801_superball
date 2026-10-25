# B 第一天交接

范围：公司 / 岗位 / 申请三个域的数据库模型设计、约束、迁移和模型层测试。按 README 第一天分工，B 的交付是「公司/岗位/申请模型设计」，不含 HTTP 接口与页面。

## 分支基础

本地分支 `feat/b-day1-domain-models`，基于 `origin/feat/a-day1-foundation`（`44380d7`）。`main` 目前只有文档，没有 Django 骨架，所以必须从 A 的分支拉；A 合并进 `main` 后本分支需要 rebase 再开 PR。

## 已交付

新增：

- `backend/employers/models.py`：`CompanyProfile`，主键即 `user_id`。
- `backend/jobs/models.py`：`Job`、`RequiredSkill`，含 `required_skill_names` 供 `matching.rank_jobs` 使用。
- `backend/applications/models.py`：`Application`，四态枚举、`PROTECT` 外键、唯一约束。
- `backend/common/constraints.py`：`not_blank()` 数据库约束表达式（去空白后判长度）。
- 三个 app 的 `0001_initial` 迁移。
- `tests/unit/test_employer_domain_models.py`：25 个真实数据库用例。
- `docs/EMPLOYER_DOMAIN_CONTRACT.md`：给 A/C 的字段、约束与接入约定。

修改（仅一处）：`backend/config/settings.py` 的 `INSTALLED_APPS` 追加 `employers`、`jobs`、`applications` 三行。未改动 A 的认证、权限、错误处理、前端代码，也未动 `tests/unit/test_workflows.py` 里的既有占位。

## 验证证据

```powershell
.venv\Scripts\python.exe -m pytest tests/unit -q
# 51 passed, 13 skipped in 20.75s

.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=config.test_settings
# No changes detected
```

基线为 A 交接记录的 `26 passed, 13 skipped`；本分支新增 25 项，未跳过任何既有用例。测试覆盖：

- 一人一份公司资料，重复创建被数据库拒绝；
- 公司名/公司描述、岗位标题/岗位描述对 `""`、`"   "`、`"\t"` 均被拒绝；
- 岗位可以没有技能；
- 同一岗位 `Python` 与 `python` 只能存一条，不同岗位可以各存一条；
- 技能名保存时去首尾空白；
- 有申请时删除岗位抛 `ProtectedError` 且数据不变；无依赖时删除岗位连带删技能；
- 新申请默认 `Pending`；重复投递被数据库拒绝且只留一条；
- 四个状态都能存，`Hired` 被拒；常量与课程合同一致。

## 尚未验证

- **未在 PostgreSQL 上实际执行**：本机没有 PostgreSQL 服务，Docker 未启动。约束表达式只用到 `LENGTH/TRIM/REPLACE/LOWER` 与表达式唯一索引，SQLite 与 PostgreSQL 都支持，但仍需有 Docker 或 PG 的机器跑一次 `TEST_DATABASE_ENGINE=postgresql`。
- 未实现 HTTP 接口、序列化器、页面；`test_workflows.py` 中 `test_fp_emp_1/2/3`、`test_fp_can_3` 仍是 skip，第二至三天替换为真实断言。
- 未更新 `SPEC.md` 的完整数据模型章节（本分支只补了已有段落中的模型描述），待与 C 的时段模型一起汇总。
- 未做 seed（`FP-DOC-3`），等接口可用后一次写完整业务数据。

## 下一步（B / Day 2–3）

1. `employers` 序列化器与 `/api/employer/company/` 的 GET/PUT。
2. `jobs` 的 CRUD 与所有权检查，删除路径捕获 `ProtectedError` → `409`。
3. `applications` 的创建（唯一约束 → `409`）、本人列表、雇主侧按匹配分排序（调 `matching.rank_applicants`）。
4. 把 `tests/unit/test_workflows.py` 的三个占位换成真实接口测试。

## 给队友的两件事

1. **A 合并 `feat/a-day1-foundation` 后**，本分支需要 rebase；`INSTALLED_APPS` 的三行是唯一与 A 冲突风险点。
2. **C 的 `InterviewSlot` 请挂到 `Job` 上并使用 `on_delete=PROTECT`**，否则 `FP-EMP-2` 的「存在面试时段时删除岗位返回 409」无法在数据库层成立。详见 `docs/EMPLOYER_DOMAIN_CONTRACT.md` 的「给 C 的接入点」。
