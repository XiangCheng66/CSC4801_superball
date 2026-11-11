# A 收尾交接：求职者权限与安装

负责人：XiangCheng66。接续 [PR #6](https://github.com/XiangCheng66/CSC4801_superball/pull/6) 的账号、资料、私有简历、推荐、投递和本人申请工作，对应 README 第 6～7 天的求职者权限和安装流程。

## 权限和回归

- 刷新账号信息若发现身份变化，销毁上一账号的工作台并读取新账号数据。已退出会话的迟到保存响应或 401 不得重新打开旧工作台或退出后来登录的账号。普通资料更新保留同账号的当前页面。
- API 响应使用 `Cache-Control: no-store`，覆盖账号、私有简历、申请、CSRF 和权限错误。原有 Session、CSRF、401/403/404 及请求字段白名单保留。
- 求职技能在进入事务前校验字符串。NUL 和未配对的 Unicode 代理字符返回 400；显示名、技能和简历均保持原值，避免写库或编码响应时失败。
- `App.test.jsx` 复现换账号时保留前一账号简历、迟到保存和迟到 401；`candidate.spec.js` 用同一浏览器的两个标签页切换账号并检查越权拒绝。`test_auth.py` 验证禁止缓存和启动 seed 保留旧密码，`test_candidate.py` 验证非法技能不产生部分更新。

## 干净安装

按 [INSTALL.md](../INSTALL.md) 从目标提交构建。示例配置默认 `DJANGO_DEBUG=0`、不自动 seed。PostgreSQL 通过 TCP 健康检查，应用完成迁移并通过健康检查后，`docker compose up --wait` 才返回；此时可在专用演示库执行 `seed_demo`。可选的 `SEED_AUTH_DEMO=1` 只创建缺失的演示账号，不覆盖密码或资料。已有业务库不需要重置或新增迁移。

并行验证可使用单独的 Compose 项目名，以及 `.env` 中的 `APP_PORT` 和 `POSTGRES_PORT`，不需要修改 Compose 文件。测试依赖来自锁文件；PostgreSQL 后端测试使用独立测试库，`seed_demo` 仅用于运行中的本地演示库。

## 团队联调

A 与 B 的申请路由都需保留：`/api/applications/` 为本人投递/查看；`/api/employer/applications/` 为雇主操作。A 的“我的申请”和 C 的“面试预约”入口并列显示，预约详情读取同一 `Booking`，无须把预约复制到另一张表。

验收顺序：雇主发布岗位和时段 → 新求职者填技能并投递 → 雇主设为 Interviewing → 求职者预约 → 双方查看 → 雇主再改状态后预约仍保留。联调和权限用例只在隔离数据库运行。各模块的原始提交、干净安装、测试与 CI 结果见 PR 的验证记录；本 PR 保留 A 的范围，B/C 各自分支由团队审查合并。
