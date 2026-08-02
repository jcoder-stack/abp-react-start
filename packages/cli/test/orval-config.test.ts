import { describe, expect, it } from "vitest";
import { createOrvalConfig } from "../src/orval-config";

const base = { input: "/abs/swagger.json", outputDir: "/abs/out", zod: true };

interface ProjectShape {
  input: { target: string };
  output: {
    client: string;
    httpClient?: string;
    mode: string;
    target: string;
    schemas?: string;
    override?: {
      mutator: { path: string; name: string };
      fetch?: { includeHttpResponseReturnType: boolean };
    };
  };
}

function projects(config: unknown): Record<string, ProjectShape | undefined> {
  return config as Record<string, ProjectShape | undefined>;
}

describe("createOrvalConfig", () => {
  it("builds the react-query project with fetch client and the abpMutator override", () => {
    const config = projects(createOrvalConfig(base));
    expect(config.api?.input.target).toBe("/abs/swagger.json");
    expect(config.api?.output.client).toBe("react-query");
    expect(config.api?.output.httpClient).toBe("fetch");
    expect(config.api?.output.mode).toBe("tags-split");
    expect(config.api?.output.target).toBe("/abs/out/endpoints");
    expect(config.api?.output.schemas).toBe("/abs/out/models");
    expect(config.api?.output.override?.mutator).toEqual({
      path: "/abs/out/mutator.ts",
      name: "abpMutator",
    });
    expect(config.api?.output.override?.fetch).toEqual({ includeHttpResponseReturnType: false });
  });
});
