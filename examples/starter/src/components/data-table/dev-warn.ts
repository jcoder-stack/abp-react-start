const warned = new Set<string>();

/**
 * DEV 期一次性告警。同一 `key` 全程只警一次。这些告警都在 render 或每渲染的 effect 里调用，
 * 不去重会刷屏。`key` 只用于去重、不出现在输出里；`message` 自带来源前缀。
 *
 * 生产构建下 `import.meta.env.DEV` 是字面 `false`，整个函数体被 DCE 掉。该守卫依赖 Vite 的
 * `import.meta.env`（TanStack Start 即 Vite）；非 Vite 构建下需自行替换成等价的环境判断。
 */
export function devWarn(key: string, message: string): void {
  if (!import.meta.env.DEV) return;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}
