# A 第三天交接

负责人：XiangCheng66。基于最新 main `e777db0`（已含 B 的统一 seed_demo），功能分支 `feat/a-day3-applications`，通过 PR 交给队友审查，不自动合并 main。

## 完成范围

- FP-CAN-3：推荐卡片投递、本人的全部申请与详情、Pending 初始状态、重复投递 409、四种状态和已有面试预约的只读展示。
- 复用 B 的 Application 模型、默认状态、唯一约束和 Job PROTECT；补一套共享 `apply_to_job` 服务，不修改模型或迁移，不依赖填写资料或简历。
- 严格输入字段、会话所有者、CSRF、401/403/404/405 边界；候选人不能读取他人申请、修改状态或撤销申请。无关数据库错误不伪装为重复。
- React 使用公共请求客户端和 C 的北京时间工具；加载/空态/失败重试、重复提交保护、冲突后重新查询、过期会话退出、桌面/手机布局与文本转义。
- 替换 FP-CAN-3 占位，补充 API/服务、完整工作台和浏览器回归；剩余 4 项占位属于 B 的申请人/状态与 C 的预约资格/竞争流程。

接口、事务与 B/C 接入详见 [APPLICATION_CONTRACT.md](APPLICATION_CONTRACT.md)。README、SPEC、INSTALL 和公共/求职者契约已同步。依赖和现有数据库均无需变更。

## 运行和演示

按 INSTALL.md 构建、迁移并在本地演示库运行 `python manage.py seed_demo`。统一 seed 会重置业务数据，只能用于本地演示；本功能本身不要求清库。

以 candidate3 / LocalDemo!2026 登录，在岗位推荐对 Generalist 投递，然后打开“我的申请”，应同时看到原有 Interviewing 和新建 Pending 申请。刷新页面可恢复；回到推荐后已投递岗位显示状态，不能再投递。candidate1 和 candidate2 可查看 seed 中其他状态。当前 seed 不创建预约；已有 Booking 的读取由真实 ORM 测试及前端测试覆盖，预约创建属于 C 后续工作。

## 验证与剩余范围

2026-11-03 本机 Python 3.11 验证：完整后端 269 passed、4 skipped；Django check、迁移遗漏和 pip check 通过；前端 52 passed，生产构建成功。容器和远程结果以本 PR 的确切提交及验证记录为准。

运行 `python -m pytest tests/unit -q -ra`、Django check、迁移遗漏与 pip check；前端 `npm test`、`npm run build`。在功能分支干净快照中构建 Docker、迁移、执行 seed_demo，再运行隔离 SQLite/PostgreSQL 测试和 `APP_URL=<本地容器地址> npm run test:e2e`。实际结果记录在本 PR 对应提交及本地验证记录，不用 Day 2 的历史测试数替代。

浏览器新增真实投递/刷新/脚本文字转义/手机布局，以及两次并行 HTTP 投递仅 201+409、本人仅一条申请、外部候选人 ID 访问拒绝。现有认证、资料/私有简历、雇主岗位和时段用例继续保留。

本次不含雇主申请人排序或状态修改、候选人预约创建、取消/撤销、PDF 和 AI 功能，不表示完整课程项目已经完成。
