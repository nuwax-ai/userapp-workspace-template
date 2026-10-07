# 接入已有项目

已有代码需要接入 workspace，或完整工程误放在平台 `code/` 等子目录时，由 agent 使用现有 `userapp-dev-guide` 增量适配。平台工作区契约返回的 `workspace_root` 是源码权威，核对 cwd 一致后才记录 `SOURCE_WORKSPACE=$PWD`；初始化与 validate 都指向该已核验根，独立客户端按用户选定的新目录初始化。
完整操作流程、布局示例与验收要求维护在
[已有项目接入指引](../skills/userapp-dev-guide/references/import-existing-project.md)。

保留原技术栈、业务、Git、根 lock 文件和 monorepo 共享依赖；仅参与编排的一级服务目录需要
manifest,也可用一级适配目录调用原根构建。配置检查、实际构建、运行与部署分别记录证据。

此页是源码仓的导航入口。npm pack 时将上述唯一正文复制为随包分发的同名文档；
使用 `template-cli docs` 查找已安装包的文档目录。

← 回到[文档首页](README.md)
