import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";

/** `~`/`~/...` 展开到 home；其余路径原样返回。 */
function expandHome(path: string): string {
  if (path !== "~" && !path.startsWith("~/")) return path;
  return join(homedir(), path.slice(2));
}

/** 从项目 `.env` 里取一个变量（仅识别 `KEY=value` 单行形态，够 .env.example 的写法用）。 */
function readEnvFileVar(cwd: string, name: string): string | undefined {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match?.[1] !== name || match[2] === undefined) continue;
    return match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

export type ExtraCaOutcome = "installed" | "unsupported" | "absent";

/**
 * 让 gen 到后端的 fetch 信任 AUTH_EXTRA_CA_FILE 指向的证书（进程 env 优先，其次项目 .env）。
 * 与 @jcoder-stack/abp-react/proxy 的 installExtraCa 行为一致；CLI 不依赖运行时包，故本地留一份。
 * 运行时缺 tls.setDefaultCACertificates（旧 Node、Bun）时返回 "unsupported"，文件不可读则抛错。
 */
export function installExtraCaFromEnv(cwd: string): ExtraCaOutcome {
  const caFile = process.env.AUTH_EXTRA_CA_FILE ?? readEnvFileVar(cwd, "AUTH_EXTRA_CA_FILE");
  if (caFile === undefined || caFile === "") return "absent";
  if (
    typeof tls.getCACertificates !== "function" ||
    typeof tls.setDefaultCACertificates !== "function"
  ) {
    return "unsupported";
  }
  const resolved = expandHome(caFile);
  let pem: string;
  try {
    pem = readFileSync(resolved, "utf8");
  } catch (error) {
    throw new Error(`AUTH_EXTRA_CA_FILE is not readable: ${resolved}`, { cause: error });
  }
  const current = tls.getCACertificates("default");
  if (!current.includes(pem)) tls.setDefaultCACertificates([...current, pem]);
  return "installed";
}
