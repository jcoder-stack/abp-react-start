import { join } from "node:path";
import { defineConfig } from "orval";
import { simplifyAbpGenericSchemaNames } from "./abp-schema-names";

/**
 * orval 的 clean 只扫 `output.target` 与 `output.schemas` 各自的目录（endpoints/models/schemas），
 * 不会碰到它们的父目录；`!mutator.ts` 是把「用户可改、只播种一次」这条约束显式写进配置，
 * 免得日后调整目录布局时把它扫掉。
 */
const CLEAN_EXCEPT_MUTATOR = ["!mutator.ts"];

/** Inputs for the ABP orval preset; paths must already be resolved by the caller. */
export interface OrvalPresetOptions {
  input: string;
  outputDir: string;
  zod: boolean;
}

/** Build the ABP orval preset: a react-query+fetch project routed through abpMutator, plus an optional zod-schemas project. */
export function createOrvalConfig(opts: OrvalPresetOptions): ReturnType<typeof defineConfig> {
  return defineConfig({
    api: {
      input: {
        target: opts.input,
        override: { transformer: simplifyAbpGenericSchemaNames },
      },
      output: {
        client: "react-query",
        httpClient: "fetch",
        mode: "tags-split",
        // 后端删接口/改 tag 后，上一轮的 endpoints/models 会留在盘上且仍可 import。
        clean: CLEAN_EXCEPT_MUTATOR,
        target: join(opts.outputDir, "endpoints"),
        schemas: join(opts.outputDir, "models"),
        override: {
          mutator: { path: join(opts.outputDir, "mutator.ts"), name: "abpMutator" },
          fetch: { includeHttpResponseReturnType: false },
        },
      },
    },
    ...(opts.zod
      ? {
          apiZod: {
            input: {
              target: opts.input,
              override: { transformer: simplifyAbpGenericSchemaNames },
            },
            output: {
              client: "zod",
              mode: "tags-split",
              clean: CLEAN_EXCEPT_MUTATOR,
              target: join(opts.outputDir, "schemas"),
            },
          },
        }
      : {}),
  });
}
