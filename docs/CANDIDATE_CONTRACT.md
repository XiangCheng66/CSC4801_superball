# 求职者资料、私有简历与岗位推荐（A / Day 2）

覆盖 FP-CAN-1、FP-CAN-2，沿用 [公共 API 契约](API_CONTRACT.md) 的 Session Cookie、CSRF、JSON 和错误格式。不提供投递、申请状态或预约操作。

## 存储与公开边界

`candidates.CandidateProfile.user_id` 是主键和 User 的一对一外键，`related_name="candidate_profile"`。保存 `skills` JSON 数组、`resume_text` 和 UTC 创建/更新时间；显示名称只保存在 `User.display_name`。

不在注册时创建资料，也不需要重置旧账号。未保存过资料的用户读取时得到有效显示名、`[]` 和空简历，GET 不写库。首次 PUT 创建记录。两个写接口都在事务中锁定对应 User 行；资料写只更新 skills 和显示名，简历写只更新 resume_text，避免相互覆盖。

简历不是公开资料。不要对 CandidateProfile 使用全字段序列化，不要把它嵌入公开账号、岗位或申请人响应。B 的申请人功能可在验证雇主及岗位所有权后读取 `user.candidate_profile.skills`，没有资料时使用 `[]`；显示名来自 User，简历仍不可返回给雇主。

## 已实现接口

| 方法 | 路径 | 成功 data |
|---|---|---|
| GET | `/api/candidate/profile/` | `{user_id, display_name, skills}` |
| PUT | `/api/candidate/profile/` | 同上；输入必须包含 display_name、skills |
| GET | `/api/candidate/resume/` | `{user_id, resume_text}` |
| PUT | `/api/candidate/resume/` | 同上；输入必须包含 resume_text |
| GET | `/api/candidate/recommendations/` | 岗位数组，字段见下文 |

`/api/candidate/profiles/<user_id>/` 与 `/api/candidate/resumes/<user_id>/` 是支持 GET/PUT 的显式所有者别名，共用同一 View。ID 是 User ID，不另造资料 ID。

所有接口先检查登录与 Candidate 角色。本人资源返回 200；匿名 401；Employer 403；Candidate 访问其他已存在用户的 ID 返回 403，即使该用户尚无资料；不存在的用户 ID 返回 404。角色检查在对象查找之前。PUT 必须带当前 CSRF Cookie 对应的 `X-CSRFToken`；未知字段、缺少必填字段和非法类型为 `400 validation_error`，不会部分保存。

PUT 资料示例：

```json
{"display_name":" Alice ","skills":[" Python ","SQL","python",""]}
```

显示名称去首尾空白后须为 1～100 字符。技能必须是 JSON 字符串数组，不自动把数字或布尔值转成字符串；单项去空白前后及 lowercase 规范化结果遵守 100 字符上限（周围空白不计）。保存使用共享 normalize_skills，去空白、lowercase、去空值、去重，再按字符串升序保存。上述请求返回显示名 Alice 与 `["python","sql"]`。空技能数组合法。

简历只接受字符串，保留前后空白和换行，不 trim，不解析 HTML，不调用模型；空字符串可清空。没有额外产品长度上限，使用框架现有请求处理限制。用户 ID、角色、密码、邮箱等均不是可写资料字段。

## 推荐列表

响应格式：

```json
{"data":[{"id":10,"title":"Backend Developer","company":"Demo Company","description":"Build services","required_skills":["Python","SQL"],"match_score":50}]}
```

每次读取当前已保存技能，未建立资料按 `[]`。查询所有实际存在的 Job，通过 select_related 加载雇主/公司，prefetch_related 加载 RequiredSkill。公司缺失时依次回退雇主显示名、用户名。公司没有资料不会导致其岗位被过滤。

调用 C 的 `matching.rank_jobs` 计算并排序；分数为整数，零分岗位保留，不分页、不截断。排序为分数降序、标题 casefold、整数岗位 ID。原文简历不参与计算，响应仅包含上例六个公开字段。当前模型使用实际删除，没有另设 active/deleted 筛选字段。

## React 与测试

Candidate 工作台保留账号操作，提供个人资料与推荐入口。资料、简历分别保存，切换入口保留草稿。技能输入支持中英文逗号和换行；保存后采用服务端规范化结果，并让后续推荐重新查询。全部用户文本通过 React 文本节点呈现。

主要证据：`test_workflows.py` 的 FP-CAN-1/2 真实用例、`test_candidate.py` 的输入/隐私/CSRF/ORM/匹配/seed 测试、CandidateWorkspace 前端测试与 candidate.spec.js 真实浏览器流程。完整复现命令见 INSTALL.md。
