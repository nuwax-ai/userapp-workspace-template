# database 目录 —— 平台自动执行的 SQL 约定

发布（activate）成功后，平台会自动按序执行包内 `database/` 目录下的 `.sql` 文件。

> ⚠️ **开发阶段不会自动执行**：本地 devrun / 沙箱调试时，本目录里的 SQL 不会被跑——
> schema 变更需先手动执行（dbx / psql 连开发库），再同步放入本目录随发布生效。

## 执行规则

- **执行顺序**：workspace 根 `database/` 先执行（适合建库、扩展、初始化类 SQL），
  之后各子项目 `{项目目录}/database/` 按**目录名字典序**执行；
  每个目录内按**文件名字典序**（建议用 `001_`、`002_` 前缀显式控制顺序）。
- **只扫一层**：仅 `database/` 的直接子文件，子目录不递归；非 `.sql` 文件
  （如本 README）不执行也不进发布包。
- **文件名白名单**：`[A-Za-z0-9._-]`（平台防注入校验）——**中文/空格/特殊字符的
  文件名会被静默跳过**（仅 warn 日志），如 `建表.sql` 不会执行。
- **目标数据库**：app 运行容器内的 PG（`$POSTGRES_USER` / `$POSTGRES_DB`，容器 ENV）；
  执行前平台会等 PG 就绪（≤60s），未就绪则本轮整体跳过。
- **幂等性要求**：每次发布都会重新执行全部 SQL 文件（无执行记录表）——
  SQL 必须自带幂等性（如 `CREATE TABLE IF NOT EXISTS`、`ON CONFLICT DO NOTHING`）。
- **失败语义**：单文件执行失败（语法/约束错误）只记录日志并跳过，**不阻断发布**——
  修复 SQL 后重新发布即可；文件内 `ON_ERROR_STOP=on`，单个文件内出错即中止该文件。
  （部署请求可用 `auto_execute_sql=false` 关闭本机制，缺省开。）

## 与 `run.migrate` 的边界

| | `database/` 目录（本约定） | `run.migrate`（project.manifest） |
|---|---|---|
| 执行者 | 平台（发布 activate 后，rcoder exec psql） | app-cli（服务启动前，应用自管迁移命令） |
| 失败 | 仅日志，忽略 | 阻断启动 |
| 适用 | 建库/扩展/平台侧初始化 | 应用自身的 schema 迁移（如 drizzle） |

## 示例

```
database/
├── 001_create_schema.sql
└── 002_seed_data.sql
backend-go/database/
└── 001_orders_table.sql
```
