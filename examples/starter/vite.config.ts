import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // consolePiping（默认开）会把「服务端日志→浏览器」「浏览器 console→服务端」双向互管，与
  // Vite 8 的 server.forwardConsole 组成回声环：任一条 client console.error 被无限增殖
  //（实测 1 条 → 5 秒 166 条嵌套 [Server][vite](client) 报错；上游 TanStack/devtools #482）。
  // 注意开关是 consolePiping 而非 enhancedLogs，后者只控制日志源码定位增强。
  plugins: [
    devtools({ consolePiping: { enabled: false } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
