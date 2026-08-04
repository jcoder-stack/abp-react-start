import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { installExtraCaFromEnv } from "../src/extra-ca";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "jc-abp-extra-ca-"));
}

// 真自签证书：tls.setDefaultCACertificates 会解析 PEM，编造的字符串过不去。
const FIXTURE_PEM = join(
  import.meta.dirname,
  "../../abp-react/test/proxy/__fixtures__/self-signed.pem",
);

describe("installExtraCaFromEnv", () => {
  afterEach(() => {
    delete process.env.AUTH_EXTRA_CA_FILE;
  });

  it("returns absent when neither process env nor .env declares the variable", () => {
    expect(installExtraCaFromEnv(tempDir())).toBe("absent");
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "AUTH_ISSUER=https://x\n# AUTH_EXTRA_CA_FILE=/commented\n");
    expect(installExtraCaFromEnv(cwd)).toBe("absent");
  });

  it("reads AUTH_EXTRA_CA_FILE from the project .env and installs the cert", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), `AUTH_EXTRA_CA_FILE=${FIXTURE_PEM}\n`);
    expect(installExtraCaFromEnv(cwd)).toBe("installed");
    expect(tls.getCACertificates("default")).toContain(readFileSync(FIXTURE_PEM, "utf8"));
  });

  it("lets the process env override the .env file", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "AUTH_EXTRA_CA_FILE=/nonexistent-from-dotenv.pem\n");
    process.env.AUTH_EXTRA_CA_FILE = FIXTURE_PEM;
    // .env 里那个不存在的路径若被读到就会抛错——不抛即证明进程 env 赢了
    expect(installExtraCaFromEnv(cwd)).toBe("installed");
  });

  it("strips quotes from the .env value", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), `AUTH_EXTRA_CA_FILE="${FIXTURE_PEM}"\n`);
    expect(installExtraCaFromEnv(cwd)).toBe("installed");
  });

  it("throws a readable error when the file is missing", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), "AUTH_EXTRA_CA_FILE=/definitely/missing.pem\n");
    expect(() => installExtraCaFromEnv(cwd)).toThrow(/not readable.*\/definitely\/missing\.pem/);
  });
});
