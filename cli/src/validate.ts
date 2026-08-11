/**
 * 校验逻辑 —— 对齐平台 Fail-Fast 规则。
 *
 * init/add 时校验 workspace 一致性,确保生成的配置能通过平台严格校验。
 */

export interface ExistingService {
  serviceId: string;
  proxyPath?: string;
  directory: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * 校验 service_id 格式(DNS-1123 label)。
 * 规则:小写字母/数字/`-`,1-63 字符,首尾须字母或数字。
 */
export function validateServiceId(serviceId: string): string | null {
  if (!serviceId) return 'service_id 不能为空';
  if (serviceId.length > 63) return `service_id 太长(${serviceId.length} > 63): "${serviceId}"`;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(serviceId)) {
    return `service_id 必须符合 DNS-1123 label(小写字母/数字/-,首尾字母数字): "${serviceId}"`;
  }
  return null;
}

/**
 * 校验 proxy.path 格式。
 * 规则:以 / 开头,不含 .. / ? / #。
 */
export function validateProxyPath(proxyPath: string): string | null {
  if (!proxyPath.startsWith('/')) {
    return `proxy.path 必须以 / 开头: "${proxyPath}"`;
  }
  if (/\.\.|[?#]/.test(proxyPath)) {
    return `proxy.path 不能含 .. ? #: "${proxyPath}"`;
  }
  return null;
}

/**
 * 检查新 service 是否和 workspace 内现有 service 冲突。
 *
 * 校验项:
 *  1. service_id 在 workspace 内唯一
 *  2. proxy.path 在 workspace 内唯一
 *  3. catch-all `/` 全 workspace 最多一个
 */
export function checkConflicts(
  newServiceId: string,
  newProxyPath: string | undefined,
  existing: ExistingService[],
): ValidationResult {
  const errors: string[] = [];

  // service_id 唯一
  const idConflict = existing.find((s) => s.serviceId === newServiceId);
  if (idConflict) {
    errors.push(
      `service_id 冲突: "${newServiceId}" 已存在于 ${idConflict.directory}/`,
    );
  }

  // proxy.path 校验(仅 web 服务有)
  if (newProxyPath) {
    const pathErr = validateProxyPath(newProxyPath);
    if (pathErr) errors.push(pathErr);

    // path 唯一
    const pathConflict = existing.find((s) => s.proxyPath === newProxyPath);
    if (pathConflict) {
      errors.push(
        `proxy.path 冲突: "${newProxyPath}" 已被 ${pathConflict.serviceId} (${pathConflict.directory}/) 占用`,
      );
    }

    // catch-all `/` 最多一个
    if (newProxyPath === '/') {
      const catchAll = existing.find((s) => s.proxyPath === '/');
      if (catchAll) {
        errors.push(
          `catch-all 路由冲突: "/" 已被 ${catchAll.serviceId} (${catchAll.directory}/) 占用。\n` +
            `  全 workspace 最多一个 / (通常给 Next.js 单体)。`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
