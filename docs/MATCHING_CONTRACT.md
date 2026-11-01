# 共享匹配契约 — C / Day 1

适用需求：FP-MATCH-1；为 A 的 FP-CAN-2 和 B 的 FP-EMP-3 提供共享计算。
共享计算已实现；A 的职位查询与推荐页面已接入，B 的申请人 HTTP 接口尚待接入。

## 导入与执行环境

```python
from matching import normalize_skills, calculate_match_score, rank_jobs, rank_applicants
```

`manage.py` 和 `pytest.ini` 已将 `backend/` 加入 Python 导入路径。
这是 Django 项目内部的无状态 Python 服务，无模型、迁移或独立 HTTP 路由，
不需要加入 `INSTALLED_APPS`。不查询数据库、不读取简历、不调用模型 API。

## 技能与分数

- 接口边界统一用 JSON 字符串数组，例如 `["Python", "SQL"]`；没有技能用 `[]`。
- Python 函数也接受字符串的可迭代集合。`None`、单个字符串、字典、非字符串元素抛出 `TypeError`，不默认为空技能。
- A/B 的 DRF serializer 应在调用前验证输入，把非法请求转换为公共 `400 validation_error`。
- 归一化顺序：`strip()`、`lower()`、删除空值、集合去重；`normalize_skills` 返回 `frozenset[str]`。
- `calculate_match_score(candidate_skills, required_skills)` 返回整数：要求为空为 100，否则为 `100 * len(C & R) // len(R)`。
- 输入不被修改，简历正文不是评分参数。原始技能列表可保留显示拼写，每次评分时统一归一化。

求职者技能已落地在 candidates.CandidateProfile.skills（经严格校验并规范化的 JSON 字符串数组）；岗位技能为 jobs.RequiredSkill 子表，经 Job.required_skill_names 转成列表。无求职者资料时按 [] 计算。A 的推荐接口已接入 rank_jobs；B 后续可通过 user.candidate_profile.skills 读取技能，但必须先检查雇主角色和岗位所有权，不得把 profile 整体序列化。

## A：职位推荐

```python
jobs = [
    {"id": 10, "title": "Backend Developer", "required_skills": ["Python", "SQL"],
     "company": "Demo Company", "description": "Build services"},
    {"id": 2, "title": "Generalist", "required_skills": [],
     "company": "Another Demo", "description": "Learn on the job"},
]
ranked = rank_jobs(["Python"], jobs)
# 返回顺序为 id=2（100 分）、id=10（50 分）；每行新增 match_score。
```

每行必需字段：整数 `id`、字符串 `title`、字符串列表 `required_skills`。
排序键为 `(-match_score, title.casefold(), id)`，ID 按整数排序，不能传入字符串 ID。
函数返回新的列表和浅拷贝行，保留其余字段，重新计算并覆盖传入的 `match_score`。
嵌套字段未深拷贝，调用方不应通过返回行修改原有嵌套数据。

A 负责查询全部未删除岗位，补齐标题、公司、技能、描述访问方式，并在响应中使用匹配结果。
模块不筛掉零分职位，也不自行截断列表。未来若增加分页，须在全量评分排序后分页。

## B：申请人排序

```python
applicants = [
    {"id": 99, "candidate_id": 2, "display_name": "Alice", "skills": ["Python"],
     "status": "Pending", "booking": None},
    {"id": 1, "candidate_id": 10, "display_name": "ALICE", "skills": ["Python"],
     "status": "Interviewing", "booking": None},
]
ranked = rank_applicants(["Python", "SQL"], applicants)
# 都是 50 分；名字忽略大小写相同，candidate_id=2 排在 10 前。
```

每行必需字段：整数 `candidate_id`、字符串 `display_name`、字符串列表 `skills`。
`candidate_id` 使用求职者的 `accounts.User.pk`，与 A 的公开账号 ID 一致；不能用申请或资料 ID 代替。
`display_name` 对应账号显示名；`skills` 由 A 后续资料模型提供。
排序键为 `(-match_score, display_name.casefold(), candidate_id)`。
返回行为与职位列表一致，状态、预约等额外字段会保留。

B 负责先验证雇主角色和岗位所有权，再查询该职位申请人；申请状态修改仍在 B 的模块。

## 安全与接入边界

这是内部服务，不是授权或序列化器。调用方必须先完成身份、角色和对象权限校验。
保留额外字段是为了业务信息完整，不能把整条 ORM/私有数据字典直接作为 API 响应。
A/B 应显式选择公开字段，尤其不能向雇主发送简历正文、密码哈希或会话秘密。

课程四种分数示例已经进入单元测试；B 的完整业务 seed 尚未建立，需要复用同样的示例。
seed_candidate_demo 已提供三组候选人技能与两个岗位，覆盖四种规定分数；完整申请/预约 seed 仍待补齐。任何 AI 解释均不能修改本模块输出的分数或顺序。

## 验证

在仓库根目录使用已安装锁定依赖的 Python：

```bash
python -m pytest tests/unit/test_matching.py -v
python -m pytest tests/unit -v -ra
```

测试直接调用实际实现，不访问数据库。完整套件同时覆盖 A 的认证业务，未实现的其他业务保留明确 skip。

## 后续预约接口依赖（尚未实现）

C 将复用 A 的会话、CSRF、角色/所有权辅助函数和 JSON 错误格式。
与 B 确认 Application 的求职者、职位、雇主及状态关联后再建立 InterviewSlot/Booking。
数据库时刻沿用 UTC / `USE_TZ=True`；展示时区在预约页面实现时明确。
`Booking.slot_id` 和 `Booking.application_id` 应各自唯一；冲突返回 `409`、`Slot already booked`。
申请状态离开 Interviewing 后不得删除预约或释放时段。以上是后续约定，不是 Day 1 完成证据。
