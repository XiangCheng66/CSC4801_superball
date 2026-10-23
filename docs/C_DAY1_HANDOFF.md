# C 第一天交接

范围：共享匹配算法、两端排序、真实单元测试、CI 骨架和对应规格。
后端沿用 A 已建立的 Django 5.2 + DRF；不新增运行依赖。

## 分支基础

本地功能分支为 `feat/c-day1-matching`，基于 A 的 `feat/a-day1-foundation`
（基础 commit `44380d7`）。开发时该基础尚未合入 `main`，因此本分支包含 A 的骨架。
没有直接修改或合并远程分支；A 合入后再按团队流程整理 PR 的基线与差异。

## 已实现

- `backend/matching/services.py`：技能归一化及整数分数公式。
- `backend/matching/ranking.py`：全部输入职位/申请人的分数与确定性排序；不修改输入。
- `tests/unit/test_matching.py`：24 个参数化展开后的真实案例，覆盖规定示例、归一化、取整、空技能、非法类型、两种同分规则、字段保留、迭代器和简历不影响评分。
- `.github/workflows/ci.yml`：Python 3.12/PostgreSQL 17 后端测试、配置与迁移检查，以及 Node 22 前端测试和构建。
- `docs/MATCHING_CONTRACT.md`：A/B 可直接使用的函数签名、字段约定和示例。
- README 需求映射、SPEC 匹配/架构/CI 说明、INSTALL 测试和 CI 使用方式。

## 本地验证记录

在 Python 3.12.14 和仓库原有锁定依赖下：

- `python -m pytest tests/unit -q -ra`：50 passed、11 skipped（隔离 SQLite 内存库）。
- 同一测试命令使用 PostgreSQL 17 临时容器和独立 `test_superball_ci`：50 passed、11 skipped。
- `python -m pip check`：无依赖冲突。
- `python manage.py check --settings=config.test_settings`：无配置问题。
- `python manage.py makemigrations --check --dry-run --settings=config.test_settings`：无遗漏迁移。
- Django shell 中直接导入匹配服务：示例分数 50，职位按 100/50 分正确排序。
- Node 22.23.4 下执行 `npm test`：13 passed；`npm run build`：成功。
- CI YAML 已解析检查；远程 GitHub Actions 尚未执行。

11 个 skip 分别属于尚未实现的预约（5 项）和求职者/雇主工作流（6 项），不是已通过的课程需求。
匹配测试没有数据库依赖；PostgreSQL 验证用于确认整个 Django 基础与 CI 测试方式兼容。
临时 PostgreSQL 容器和数据库已清理，没有修改本地演示数据库。

本机已建立被 Git 忽略的 `.venv`。可在仓库根目录执行 `.venv/bin/python -m pytest tests/unit -q -ra` 重现默认测试。系统 Node 原为 24，本次使用项目 `.tools/node22/` 内的 Node 22 运行前端验证，没有替换全局 Node；其他机器按 INSTALL.md 准备 Node 22 即可。

## A/B 接入

1. 阅读 [共享匹配契约](MATCHING_CONTRACT.md)，统一使用 `from matching import ...`。
2. A 将求职者技能与全部当前职位映射为契约字段，使用 `rank_jobs`；B 在权限检查后使用 `rank_applicants`。
3. ID 使用整数；申请人排序的最终键是求职者 User ID，不是 Application ID。
4. 技能存储字段由 A/B 建立后更新 SPEC。接口 serializer 验证字符串数组，内部函数不会把非法类型默认为空技能。
5. 输出只选择公开字段；排序服务保留额外字段不代表可以把私有简历或内部数据发给雇主。
6. B 的完整业务 seed 还需包含四种匹配示例；当前认证 seed 不满足完整演示数据要求。

## 后续工作

- 与 A/B 的真实资料、职位、申请模型及页面联调；当前没有职位推荐/申请人 HTTP 接口。
- Day 2–3：面试时段模型与迁移、管理接口和页面，明确 UTC 与展示时区。
- Day 4–5：预约资格、事务、唯一约束、409 冲突及双方可见性。
- 完整应用 Dockerfile/Compose 的构建启动验证尚待补充；PostgreSQL 容器测试不等于应用镜像通过。
- 分支推送后检查 Actions 的真实结果，再由队友审查、按团队流程合并。
