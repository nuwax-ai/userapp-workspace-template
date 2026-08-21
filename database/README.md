# database 目录 —— 平台自动执行的 SQL 约定

发布（activate）成功后，平台会自动按序执行包内 `database/` 目录下的 `.sql` 文件。

## 执行规则

- **执行顺序**：workspace 根 `database/` 先执行（适合建库、扩展、初始化类 SQL），
  之后各子项目 `{项目目录}/database/` 按**目录名字典序**执行；
  每个目录内按**文件名字典序**（建议用 `001_`、`002_` 前缀显式控制顺序）。
- **目标数据库**：app 运行容器内的 PG（`$POSTGRES_USER` / `$POSTGRES_DB`，容器 ENV）。
- **幂等性要求**：每次发布都会重新执行全部 SQL 文件——SQL 必须自带幂等性
  （如 `CREATE TABLE IF NOT EXISTS`、`ON CONFLICT DO NOTHING`）。
- **失败语义**：单文件执行失败（语法/约束错误）只记录日志并跳过，**不阻断发布**——
  修复 SQL 后重新发布即可；文件内 `ON_ERROR_STOP=on`，单个文件内出错即中止该文件。
- **不进包的内容**：非 `.sql` 文件（如本 README）不执行也不进发布包的数据面。

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
