# A/B/C Day 2 集成记录

日期：2026-11-01。以 main 的 `a12e4fe459a661c7668c0cd402d944a0359c3a04` 为基线，保留各分支提交历史并整合：

| 角色 | 分支 | 原始 head | 本次保留的功能 |
|---|---|---|---|
| A | feat/a-day2-candidate-profile | cf711bc692c4143005b5d2d821519d1cf0fe32bc | 资料、技能、私有原文简历、全岗位推荐 |
| B | feat/b-day2-employer-api | d2d8ba83798b2ba7edd75863b8652c84925d1ae1 | 公司资料和本人岗位 CRUD、删除冲突 |
| C | feat/c-day2-availability | bf716eb21892952447dea69f616505f66545f7a1 | 雇主未来 30 分钟时段、UTC/北京时间、删除保护 |

对应 PR：[A #2](https://github.com/XiangCheng66/CSC4801_superball/pull/2)、[B #3](https://github.com/XiangCheng66/CSC4801_superball/pull/3)、[C #4](https://github.com/XiangCheng66/CSC4801_superball/pull/4)。合并保留三个分支的原始 head 和作者信息。

## 集成调整

- 总路由同时注册 accounts/candidates、`api/employer/`、`api/employer/jobs/` 和 scheduling，位于 API 404 兜底之前。B 子路由使用相对前缀，不能直接全部挂在 api 根下。
- App 按角色进入 CandidateWorkspace 或 EmployerDashboard。雇主统一保留账号信息、刷新、角色检查与退出，并同时显示 B 的岗位管理和 C 的时段管理；不再依赖 AccountHome 单独挂载时段，以免雇主页面替换后丢失功能。
- EmployerWorkspace 嵌入时不重复显示账号问候。岗位创建、编辑和删除成功后增加 revision，自动刷新 C 的岗位选项和时段标题；没有复制岗位或时段业务服务。
- 合并公共 CSS，取消雇主分支对所有工作台卡片的 720px 限宽；把雇主岗位样式限定到其容器，保留求职者与时段的手机布局。
- 保留三组真实测试与剩余占位。浏览器用例改为按新建岗位行定位；employer2 在组合 seed 后有 Generalist 岗位，应验证它只能看到自己的选项，而非假设它没有岗位。

## 跨模块验收

`tests/unit/test_day2_integration.py::test_employer_job_candidate_matching_and_slot_deletion_guard_work_together` 使用真实 API/模型验证：创建公司与岗位、保存候选技能、推荐显示公司和 50 分、创建真实时段、有时段时岗位删除返回 409 且数据不变、删除时段后岗位可删、推荐随之移除。

`frontend/e2e/day2-integration.spec.js` 用两个独立浏览器身份执行同一流程，并确认岗位技能编辑后推荐更新为零分，以及新岗位自动进入时段选择列表。原始 A/B/C 浏览器用例也全部保留。

2026-11-01 集成验证：

- 本机完整后端 218 passed、5 skipped；前端 44 passed，生产构建成功。
- 从干净 Git archive 构建 Docker 镜像；构建阶段实际运行前端测试和生产打包。应用以 student 用户、DEBUG=0 运行，没有源码绑定挂载。
- 容器内 SQLite 和独立 PostgreSQL 测试库分别 218 passed、5 skipped；Django 配置、迁移遗漏和依赖检查通过。
- Edge/Playwright 访问容器页面与真实 API：10 passed，覆盖 A/B/C 原有流程和跨模块联动；桌面与手机截图已检查。
- 独立 Compose 项目 superball-day2-integrated，网站 8003、数据库宿主机端口 55435；app/db 均 healthy，健康接口确认 PostgreSQL。原有预览和数据卷保留。
- 源码、私有配置排除、25 项需求映射和文档链接检查通过；日志、截图、私有 .env 与构建副本保留在 Git 忽略的 .runtime 目录。

集成功能提交为 `20f4128109f5b178622c6f261fedc8167a1c939a`；之后仅补充本验证记录。最终 main 的确切提交及远程检查，以该提交的 GitHub Actions 为准，不以各分支历史测试数字替代。

## 启动与演示

按 INSTALL.md 构建并启动，再顺序执行：

```bash
docker compose exec -T app python manage.py seed_candidate_demo
docker compose exec -T app python manage.py seed_availability_demo
```

candidate1/2/3 与 employer1/2 的公开 local/demo 密码均为 `LocalDemo!2026`。前者技能 Python+SQL / Python / Rust，后者维护自己的公司和岗位；employer1 另有保留时段岗位及明天北京时间 09:00/09:30 时段。两个 seed 不清空其他数据，也不等同于最终完整业务重置。

## 尚未完成

投递与本人申请列表、雇主申请人/状态管理、候选人预约与竞争处理仍待实现。5 项 skipped 对应这些未完成工作流。最小 Booking 存储和已预约删除保护，不代表 FP-SCHED-2/3 的预约服务已完成。

A/B/C 的各自 Day 2 交接文档保留为独立分支历史证据；当前整体架构和状态以本记录、SPEC 及当前代码为准。
