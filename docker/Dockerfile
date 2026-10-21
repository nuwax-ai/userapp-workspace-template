# ============================================================================
# UserApp workspace 模板 — 本地验证镜像（自包含,不依赖 rcoder 仓库）
# ============================================================================
# 单容器复刻平台运行时：多语言工具链 + app-cli（npm 平台包）+ pingap + PG16。
# 配合 entrypoint.sh 跑通「manifest 校验 → 7 服务全量编译 → 产物态运行 → 9080 冒烟」。
#
# 基础采用与当前平台相同的 Debian trixie 系列，提供 Python 3.13。
# Rust 使用该系列的 stable 更新版本，不固定 Rust 数值版本。
# 本地镜像独立构建，版本/ABI 对齐不能代替真实平台运行验收。
#
# 分层从稳定到易变（最大化构建缓存）：apt 基础 → PG → Node → JDK → Go → Python
# → cargo 源 → pingap → app-cli（最常变,最后）。

ARG DOCKER_MIRROR=

# ── 国内镜像加速（空串/官方值可覆盖；compose build args 透传）───────────────
ARG APT_MIRROR=mirrors.aliyun.com
ARG NPM_REGISTRY=https://registry.npmmirror.com
# app-cli 安装独立源：新发布的包 npmmirror 有同步延迟,默认走官方
ARG APP_CLI_REGISTRY=https://registry.npmjs.org
ARG APP_CLI_VERSION
ARG GOPROXY_URL=https://goproxy.cn,direct
ARG GO_VERSION=1.26.4
ARG GO_DOWNLOAD_URL=https://go.dev/dl
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG MAVEN_ALIYUN=true
ARG CARGO_CN=true
# GitHub 下载代理前缀（如 https://ghfast.top/）;空 = 直连
ARG GITHUB_PROXY=
ARG NODE_MAJOR=22
ARG PINGAP_VERSION=0.14.3
ARG RUST_BASE_TAG=trixie

FROM ${DOCKER_MIRROR}rust:${RUST_BASE_TAG}

ARG DEBIAN_FRONTEND=noninteractive
ARG APT_MIRROR
ARG NPM_REGISTRY
ARG APP_CLI_REGISTRY
ARG APP_CLI_VERSION
ARG GOPROXY_URL
ARG GO_VERSION
ARG GO_DOWNLOAD_URL
ARG PIP_INDEX_URL
ARG MAVEN_ALIYUN
ARG CARGO_CN
ARG GITHUB_PROXY
ARG NODE_MAJOR
ARG PINGAP_VERSION

# 新 CLI 契约须使用已发布的匹配版本，不默认安装旧版。
RUN test -n "$APP_CLI_VERSION" || { echo "APP_CLI_VERSION must name a published release supporting subcommand options" >&2; exit 1; }

# ── 1. apt 换源 + 基础工具 ─────────────────────────────────────────────────
RUN curl -sSL https://linuxmirrors.cn/main.sh | bash -s -- \
        --source ${APT_MIRROR} --protocol https --use-intranet-source false \
        --install-epel false --backup false --upgrade-software false \
        --clean-cache true --ignore-backup-tips && \
    apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget gnupg2 git jq zip unzip \
        procps less vim && \
    rm -rf /var/lib/apt/lists/*

# ── 2. PostgreSQL 16（pg_isready 供 app-cli 探测;服务连 localhost:5432）──────
RUN install -d /usr/share/postgresql-keyring && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/postgresql-keyring/pgdg.gpg && \
    chmod 644 /usr/share/postgresql-keyring/pgdg.gpg && \
    PG_CODENAME="$(. /etc/os-release; printf '%s' "$VERSION_CODENAME")" && \
    echo "deb [signed-by=/usr/share/postgresql-keyring/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt ${PG_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y --no-install-recommends postgresql-16 && \
    rm -rf /var/lib/apt/lists/* && \
    install -d -o postgres -g postgres /run/postgresql && \
    # 真实 pg_isready 直链 PATH（pg_wrapper 版找不到裸 pg_ctl 起的实例）
    ln -sf /usr/lib/postgresql/16/bin/pg_isready /usr/local/bin/pg_isready

# ── 3. Node ${NODE_MAJOR} + pnpm@10（nodesource,与平台 runtime 镜像同款）────
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/* && \
    npm config set registry ${NPM_REGISTRY} && \
    npm install -g pnpm@10
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    npm_config_store_dir=/cache/pnpm

# ── 4. Temurin 25 JDK（adoptium;mvnw wrapper 自下 maven 3.9.16 落 ~/.m2 卷）──
RUN apt-get update && \
    apt-get install -y --no-install-recommends apt-transport-https && \
    wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
        | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(awk -F= '/VERSION_CODENAME/{print $2}' /etc/os-release) main" \
        > /etc/apt/sources.list.d/adoptium.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends temurin-25-jdk && \
    ARCH=$(dpkg --print-architecture) && \
    ln -sf /usr/lib/jvm/temurin-25-jdk-${ARCH} /usr/lib/jvm/temurin-25-jdk-current && \
    java -version && javac -version && \
    rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/temurin-25-jdk-current
ENV PATH="${JAVA_HOME}/bin:${PATH}"
# Maven Central 走阿里云镜像（依赖下载大头）
RUN if [ "${MAVEN_ALIYUN}" = "true" ]; then \
        mkdir -p /root/.m2 && printf '%s\n' \
            '<?xml version="1.0" encoding="UTF-8"?>' \
            '<settings>' \
            '  <mirrors>' \
            '    <mirror>' \
            '      <id>aliyun-central</id>' \
            '      <mirrorOf>central</mirrorOf>' \
            '      <url>https://maven.aliyun.com/repository/public</url>' \
            '    </mirror>' \
            '  </mirrors>' \
            '</settings>' > /root/.m2/settings.xml; \
    fi

# ── 5. Go（tarball;go.mod 要求 >=1.26.0,与平台 runtime 镜像同版）────────────
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL ${GO_DOWNLOAD_URL}/go${GO_VERSION}.linux-${ARCH}.tar.gz \
        | tar -C /usr/local -zxf -
ENV GOPROXY=${GOPROXY_URL}
ENV PATH=/usr/local/go/bin:/root/go/bin:${PATH}

# ── 6. Python 3（trixie 原生 3.13，与当前平台的 Python ABI 对齐）───────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv && \
    python3 -c 'import sys; assert sys.version_info[:2] == (3, 13), sys.version' && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf /usr/bin/python3 /usr/bin/python
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

# ── 7. cargo 国内源（backend-rust 构建拉包;不动工具链,只写 registry 替换）────
RUN if [ "${CARGO_CN}" = "true" ]; then \
        printf '%s\n' \
            '[source.crates-io]' \
            'replace-with = "rsproxy-sparse"' \
            '' \
            '[source.rsproxy-sparse]' \
            'registry = "sparse+https://rsproxy.cn/index/"' \
            '' \
            '[net]' \
            'git-fetch-with-cli = true' > /usr/local/cargo/config.toml; \
    fi

# ── 8. pingap（官方 GitHub release;版本与 app-cli 内 pin 的 pingap-config 对齐）──
# 注意：官方资产名不带版本前缀（pingap-linux-gnu-<arch>-full.tar.gz）;
# GITHUB_PROXY 可加代理前缀（国内网络直连易超时）。
RUN ARCH=$(dpkg --print-architecture | sed -e 's/amd64/x86/' -e 's/arm64/aarch64/') && \
    curl -fsSL "${GITHUB_PROXY}https://github.com/vicanso/pingap/releases/download/v${PINGAP_VERSION}/pingap-linux-gnu-${ARCH}-full.tar.gz" \
        | tar -C /usr/local/bin -zxf - && \
    mv /usr/local/bin/pingap-linux-gnu-${ARCH}-full /usr/local/bin/pingap && \
    chmod +x /usr/local/bin/pingap && \
    pingap --version | grep -F "pingap ${PINGAP_VERSION}"

# ── 9. app-cli（npm 平台包,最后装：最常变）────────────────────────────────
# - 显式官方 registry（新发布包 npmmirror 未同步）;
# - app-cli-bin 符号链接直连平台二进制：entrypoint/serve 用它 exec 成 PID1,
#   绕开 node wrapper 的转发层（信号语义最干净）;wrapper `app-cli` 仍可交互用。
#   （nodesource 的 node 全局根是 /usr/lib/node_modules,用 npm root -g 动态解析）
RUN npm install -g --registry "${APP_CLI_REGISTRY}" @nuwax-ai/app-cli@${APP_CLI_VERSION} && \
    app-cli --version && \
    ln -sf "$(find "$(npm root -g)" -type f -path '*app-cli-linux-*/app-cli' | head -n1)" \
        /usr/local/bin/app-cli-bin && \
    /usr/local/bin/app-cli-bin --version && \
    /usr/local/bin/app-cli-bin gen-lock --workspace /app/code --help >/dev/null && \
    /usr/local/bin/app-cli-bin build --workspace /app/code --help >/dev/null && \
    /usr/local/bin/app-cli-bin serve --workspace /app/code --help >/dev/null

# ── 10. 运行时布局 ─────────────────────────────────────────────────────────
# workspace 挂载点 = compose bind mount 仓库根;PGDATA 落 named volume。
ENV APP_CLI_WORKSPACE=/app/code \
    APP_CLI_LOG_DIR=/app/logs \
    PGDATA=/data/pg \
    POSTGRES_USER=app \
    POSTGRES_PASSWORD=app \
    POSTGRES_DB=app \
    PGHOST=localhost \
    PGPORT=5432
RUN mkdir -p /app/code /app/logs /data/pg /run/app-cli && \
    chown postgres:postgres /data/pg

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app/code
# 9080 pingap 应用入口 / 3010 app-cli 管理 API。
# 9081（workspace index 兜底页）本模板不启用：userapp-next 声明 [proxy].path="/"
# 独占根路由后 index.html 不被托管。
EXPOSE 9080 3010

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["verify"]
