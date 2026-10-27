# A 第二天交接

负责人：XiangCheng66。基于集成后的 A/B/C Day 1，交付 FP-CAN-1、FP-CAN-2。功能分支 `feat/a-day2-candidate-profile`，通过 PR 审查，不自动合并 main。

## 已交付

- CandidateProfile 模型与初始迁移；技能 JSON 持久化，显示名继续使用 User。
- 本人资料/简历 GET/PUT 和显式 User ID 别名，401/403/404、严格字段、CSRF、事务和所有权检查。
- 简历原文保留空白，可替换与清空，仅本人可读写；不进入资料、账号和推荐响应。
- 查询全部岗位，预加载技能和公司，复用 C 的 rank_jobs；不丢弃零分，保留规定的同分规则，公司缺失有雇主名称回退。
- React 求职者工作台、独立资料/简历保存、纯文本预览、推荐列表、错误/重试、手机布局；原账号和雇主账号操作保留。
- 幂等 seed_candidate_demo：三个求职者、两个雇主、两个保留演示岗位，覆盖四种匹配分数；不清空其他数据或简历。
- 公开接口见 [CANDIDATE_CONTRACT.md](CANDIDATE_CONTRACT.md)，安装与命令见 [INSTALL.md](../INSTALL.md)。

## 验证命令

2026-10-27 验证结果：

- 本机 Python 3.11：完整后端 129 passed、9 skipped；Django 检查、迁移遗漏检查与 pip check 通过。
- 前端 Vitest：23 passed；Vite 生产构建通过。Docker 构建阶段也实际执行了这 23 项测试与打包。
- 从功能提交的干净 Git archive 构建原始 Dockerfile；应用以 student 用户、DEBUG=0 运行，应用和 PostgreSQL 两个容器均 healthy。
- 容器 Python 3.12：默认隔离 SQLite 和独立 PostgreSQL 测试库分别 129 passed、9 skipped；配置、迁移与依赖检查通过。
- Edge/Playwright 访问容器页面与 API：5 passed，覆盖原账号流程、新求职者资料/原文简历保存和刷新、直接跨用户 GET/PUT 拒绝、技能变更后的推荐重算、零分岗位与手机布局。桌面/手机截图已检查。
- 本地验证使用独立 Compose 项目 superball-a-day2、网站 8002、数据库 55434；只是端口覆盖，仓库原始 Compose 仍为 8000/5432。截图、日志、私有配置与构建副本保存在 Git 忽略目录，没有提交。
- 剩余 9 项 skip 属于投递/申请、雇主业务工作流和预约，不能当作已完成功能。

```bash
python -m pytest tests/unit -q
TEST_DATABASE_ENGINE=postgresql python -m pytest tests/unit -q
python manage.py check
python manage.py makemigrations --check --dry-run
python -m pip check
cd frontend
npm test
npm run build
```

容器按 INSTALL.md 构建、启动，执行 `seed_candidate_demo`。容器 pytest 使用 `-o cache_dir=/tmp/pytest-cache`，适配 student 用户。浏览器使用 `APP_URL` 指向容器网站，`npm run test:e2e`，并可用 PLAYWRIGHT_EXECUTABLE_PATH 选择本机 Edge。

验证记录和确切提交对应的远程 CI 结果记录在本次 PR；不得将历史 Day 1 的测试数当作当前证据。

## B/C 接入与后续范围

- B 在验证雇主角色和岗位所有权后，从候选人 User 读取 candidate_profile.skills（没有记录时按 []），显示名仍取 User；只输出公开字段，永不读取或返回简历。
- C 的匹配模块未改公式或排序；A 的推荐接口和 B 后续申请人接口必须继续复用它。
- 本次 seed 只支撑资料/推荐演示，保留 demo 账号会重置为公开密码和显示名。申请四态、预约竞争与完整重置命令仍由 B/C 后续补齐。
- FP-CAN-3、雇主业务接口/页面、预约等仍有 9 个明确 skipped 占位；未宣称全部课程需求完成。
- 没有新依赖、第三方服务、LLM、PDF 上传或新的认证机制。
