# 接入已有项目

已有代码手动导入 workspace 后,由 agent 使用现有 `userapp-dev-guide` 进行增量适配。
完整操作流程、布局示例与验收要求维护在
[已有项目接入指引](../skills/userapp-dev-guide/references/import-existing-project.md)。

保留原技术栈、业务、Git、根 lock 文件和 monorepo 共享依赖；仅参与编排的一级服务目录需要
manifest,也可用一级适配目录调用原根构建。配置检查、实际构建、运行与部署分别记录证据。

此页是源码仓的导航入口。npm pack 时将上述唯一正文复制为随包分发的同名文档；
使用 `template-cli docs` 查找已安装包的文档目录。

← 回到[文档首页](README.md)
