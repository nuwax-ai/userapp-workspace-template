import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * ESLint flat config —— 直接用 eslint-config-next 16 的原生 flat 导出。
 * Next 16 起 eslint-config-next 已原生 flat，不再需要 @eslint/eslintrc FlatCompat。
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  { ignores: ['drizzle/'] }, // node_modules/.next/ 等已内置忽略
];

export default eslintConfig;
