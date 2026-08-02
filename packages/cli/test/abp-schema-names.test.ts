import { describe, expect, it } from "vitest";
import { shortenAbpGenericName, simplifyAbpGenericSchemaNames } from "../src/abp-schema-names";

const paged = (arg: string) =>
  `Volo.Abp.Application.Dtos.PagedResultDto\`1[[${arg}, Asm, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]`;

describe("shortenAbpGenericName", () => {
  it("shortens a single-arg ABP generic to Container + Of + Arg", () => {
    expect(shortenAbpGenericName(paged("Volo.Abp.Identity.IdentityUserDto"))).toBe(
      "PagedResultDtoOfIdentityUserDto",
    );
    expect(shortenAbpGenericName(paged("AbpSwagger.Books.BookDto"))).toBe(
      "PagedResultDtoOfBookDto",
    );
  });

  it("returns undefined for a non-generic schema id", () => {
    expect(shortenAbpGenericName("Volo.Abp.Identity.IdentityUserDto")).toBeUndefined();
  });

  it("leaves nested generics untouched", () => {
    expect(shortenAbpGenericName(paged(paged("X")))).toBeUndefined();
  });
});

describe("simplifyAbpGenericSchemaNames", () => {
  it("renames generic schemas and rewrites every $ref, leaving non-generic schemas as-is", () => {
    const longKey = paged("Volo.Abp.Identity.IdentityUserDto");
    const doc: { components: { schemas: Record<string, unknown> }; paths: unknown } = {
      components: {
        schemas: {
          [longKey]: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { $ref: "#/components/schemas/Volo.Abp.Identity.IdentityUserDto" },
              },
            },
          },
          "Volo.Abp.Identity.IdentityUserDto": { type: "object" },
        },
      },
      paths: {
        "/api/identity/users": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": { schema: { $ref: `#/components/schemas/${longKey}` } },
                },
              },
            },
          },
        },
      },
    };

    const out = simplifyAbpGenericSchemaNames(doc);
    const keys = Object.keys(out.components.schemas);
    expect(keys).toContain("PagedResultDtoOfIdentityUserDto");
    expect(keys).toContain("Volo.Abp.Identity.IdentityUserDto");
    const json = JSON.stringify(out);
    expect(json).toContain("#/components/schemas/PagedResultDtoOfIdentityUserDto");
    expect(json).not.toContain("PublicKeyToken");
    // the inner $ref to a non-generic schema is preserved
    expect(json).toContain("#/components/schemas/Volo.Abp.Identity.IdentityUserDto");
  });

  it("returns a doc without components schemas untouched", () => {
    const doc = { paths: {} };
    expect(simplifyAbpGenericSchemaNames(doc)).toBe(doc);
  });
});
