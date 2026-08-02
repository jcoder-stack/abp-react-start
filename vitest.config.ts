import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./examples/starter/src", import.meta.url).pathname } },
  test: {
    include: [
      "packages/**/test/**/*.test.{ts,tsx}",
      "registry/**/test/**/*.test.{ts,tsx}",
      "examples/starter/test/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    globals: true,
    setupFiles: ["./vitest-setup.ts"],
    // 默认 5s 对这套用例太紧：空闲机器上最慢的单测已经 2.5s（date-fields 要点开日历、
    // data-table 要渲染整张表），只剩一倍余量。CI 的两核 runner 一并发就越线，表现为
    // 日期用例间歇性变红。放宽只让真挂住的用例晚 15s 失败，换掉的是「按机器负载随机红」。
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // 类型契约测试(*.test-d.ts):只静态检查、从不执行。放 test/ 而非 src/ 的前提是这里
    // 真的对它们跑 tsc。@ts-expect-error 失守会让 npm test 失败,不会变成永不报警的摆设。
    typecheck: {
      enabled: true,
      include: ["examples/starter/test/**/*.test-d.ts"],
      tsconfig: "examples/starter/tsconfig.typetest.json",
    },
    server: {
      // orval-generated code (dynamically imported from tmp dirs in cli gen tests) reaches
      // @tanstack/react-query's nested "@tanstack/query-core" import; externalizing it makes
      // vite-node resolve that bare specifier from the wrong base and fail to find it.
      deps: { inline: [/@tanstack/] },
    },
  },
});
