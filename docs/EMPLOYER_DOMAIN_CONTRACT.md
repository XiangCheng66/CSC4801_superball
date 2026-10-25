# 雇主域模型契约（B / Day 1）

面向 A、C 的接入说明。实现位置：`backend/employers/`、`backend/jobs/`、`backend/applications/`。

## 表与关系

| 模型 | 表 | 主键 | 关系 |
|---|---|---|---|
| `employers.CompanyProfile` | `employers_companyprofile` | `user_id`（即账号 ID） | 1:1 `accounts.User`（`related_name="company_profile"`） |
| `jobs.Job` | `jobs_job` | `id` | N:1 `accounts.User`（`employer`，`related_name="jobs"`） |
| `jobs.RequiredSkill` | `jobs_requiredskill` | `id` | N:1 `jobs.Job`（`required_skills`） |
| `applications.Application` | `applications_application` | `id` | N:1 `jobs.Job`（`PROTECT`）；N:1 `accounts.User`（`candidate`） |

```text
User(Employer) 1 ── 1 CompanyProfile
User(Employer) 1 ── N Job 1 ── N RequiredSkill
Job 1 ── N Application N ── 1 User(Candidate)
```

## 五个设计决定

1. **`Job.employer` 指向 `User`，不指向 `CompanyProfile`。**
   所有权检查统一比较用户 ID，可直接配合 `common.permissions.get_owned_object(..., owner_field="employer_id")`。公司名展示走 `job.employer.company_profile.company_name`，列表查询需 `select_related("employer__company_profile")`。

2. **`CompanyProfile` 以 `user_id` 作主键。**
   一个雇主只有一份公司资料，URL 里不出现 profile ID，避免"猜 profile id 越权"这一类攻击面。

3. **技能用子表，不用 JSON 字段。**
   `RequiredSkill.name` 保留雇主输入的原始大小写用于展示；唯一性由 `UNIQUE (job_id, LOWER(name))` 保证，保存前 `strip()`。评分仍由 `matching.normalize_skills` 做完整归一化。岗位可以没有任何技能，此时 `required_skill_names == []`，按 `FP-MATCH-1` 得 100 分。

4. **`Application.job` 使用 `on_delete=PROTECT`。**
   删除有申请的岗位抛 `ProtectedError`，接口层映射为 `409` 且所有行不变（`FP-EMP-2`）。这是数据库层保证，不是"先查再删"的竞态写法。

5. **四态用 `TextChoices` + `CHECK` 约束双保险。**
   `APPLICATION_STATUSES = ("Pending", "Interviewing", "Rejected", "Accepted")`，模块级常量供 serializer 复用；Django 的 `choices` 只做表单校验，`CHECK` 才挡直接写库。

## 约束清单

| 需求 | 约束 | 名称 |
|---|---|---|
| FP-EMP-1 | `company_name` 非空（`LENGTH(TRIM(REPLACE(...))) > 0`） | `employers_company_profile_name_not_blank` |
| FP-EMP-1 | `description` 非空 | `employers_company_profile_description_not_blank` |
| FP-EMP-2 | `title` 非空 | `jobs_job_title_not_blank` |
| FP-EMP-2 | `description` 非空 | `jobs_job_description_not_blank` |
| FP-EMP-2 | 同一岗位技能名不区分大小写唯一 | `jobs_required_skill_unique_per_job` |
| FP-CAN-3 | 同一候选人对同一岗位只能有一条申请 | `applications_unique_job_candidate` |
| FP-EMP-3 | 状态只能取四个值 | `applications_valid_status` |

非空约束用 `common/constraints.py::not_blank()`：先去掉 `\t \n \r`，再 `TRIM` 空格，最后判 `LENGTH > 0`。只写 `~Q(field="")` 会放过 `"   "`。

## 时区与时间

本域不存时间点，只有 `created_at/updated_at`，随 `USE_TZ=True` 存 UTC。面试时段的时区约定由 C 负责，候选人与雇主两端必须显示同一时区。

## 给 A 的接入点

- 候选人技能从 `CandidateProfile` 读取后交给 `matching.rank_jobs`，不要自己实现打分。
- 岗位推荐列表每行需要 `id / title / required_skills / employer company_name`，`required_skills` 用 `job.required_skill_names`。
- 投递入口调用 B 的服务函数，不要在 A 的 View 里直接 `Application.objects.create`：唯一约束异常需要统一映射成 `409`，并且后续要带"新申请为 Pending"的业务规则。两套写库逻辑会立刻分叉。
- 候选人删除自己的申请、查看自己申请列表时，`owner_field="candidate_id"`。

## 给 C 的接入点

- **申请人列表**：把 `Application` 映射成 `rank_applicants` 的输入
  `{"candidate_id": app.candidate_id, "display_name": app.candidate.display_name, "skills": [...]}`
  排序最后的稳定键是**候选人 User ID**，不是 Application ID。
- **面试时段必须挂到岗位**：建议 `InterviewSlot.job = ForeignKey("jobs.Job", on_delete=PROTECT, related_name="interview_slots")`。
  若时段只挂 `employer`，`FP-EMP-2` 的"岗位删除在存在面试时段时返回 409"就无法在数据库层保证。这条需要 C 确认后再合并。
- 已预约时段不可删、不可显示为可用，由 `scheduling` 自己保证；B 只依赖 `Job.interview_slots` 的反向集合做删除前置判断（或直接捕获 `ProtectedError`）。

## 迁移依赖

```text
accounts.0001 ── employers.0001
              └─ jobs.0001 ── applications.0001
```

`applications.0001` 同时依赖 `jobs.0001` 与 `settings.AUTH_USER_MODEL` 的可交换依赖。合并顺序必须是 A 的 accounts 先落地。
