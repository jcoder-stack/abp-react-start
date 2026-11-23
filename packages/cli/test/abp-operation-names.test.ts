import { describe, expect, it } from "vitest";
import { type AbpAction, nameAbpOperations, readAbpActions } from "../src/abp-operation-names";

function action(httpMethod: string, url: string, name: string, group = "Role"): AbpAction {
  return { httpMethod, url, name, group };
}

function operationIds(doc: { paths: Record<string, Record<string, { operationId?: string }>> }) {
  return Object.fromEntries(
    Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]) => [`${method} ${path}`, op.operationId]),
    ),
  );
}

describe("nameAbpOperations", () => {
  it("names an operation after its swagger tag and the C# method behind the route", () => {
    const doc = {
      paths: {
        "/api/identity/roles": { get: { tags: ["Role"] }, post: { tags: ["Role"] } },
        "/api/identity/roles/{id}": { get: { tags: ["Role"] } },
      },
    };
    nameAbpOperations(doc, [
      action("GET", "api/identity/roles", "GetListAsync"),
      action("POST", "api/identity/roles", "CreateAsync"),
      action("GET", "api/identity/roles/{id}", "GetAsync"),
    ]);
    expect(operationIds(doc)).toEqual({
      "get /api/identity/roles": "roleGetList",
      "post /api/identity/roles": "roleCreate",
      "get /api/identity/roles/{id}": "roleGet",
    });
  });

  it("matches routes whose parameter is spelled differently on the two sides", () => {
    const doc = { paths: { "/api/app/book/{id}": { get: { tags: ["Book"] } } } };
    nameAbpOperations(doc, [action("GET", "api/app/book/{Id:guid}", "GetAsync", "Book")]);
    expect(operationIds(doc)).toEqual({ "get /api/app/book/{id}": "bookGet" });
  });

  it("falls back to a path-derived name without the api/<module> prefix for an unknown route", () => {
    const doc = { paths: { "/api/app/book/{id}": { put: { tags: ["Book"] } } } };
    nameAbpOperations(doc, []);
    expect(operationIds(doc)).toEqual({ "put /api/app/book/{id}": "putBookId" });
  });

  it("keeps an operationId the spec already declares", () => {
    const doc = {
      paths: { "/api/identity/roles": { get: { tags: ["Role"], operationId: "ListRoles" } } },
    };
    nameAbpOperations(doc, [action("GET", "api/identity/roles", "GetListAsync")]);
    expect(operationIds(doc)).toEqual({ "get /api/identity/roles": "ListRoles" });
  });

  it("assigns a name two operations would share to neither of them", () => {
    const doc = {
      paths: {
        "/api/app/book": { get: { tags: ["Book"] } },
        "/api/app/book/search": { get: { tags: ["Book"] } },
        "/api/app/book/{id}": { get: { tags: ["Book"] } },
      },
    };
    nameAbpOperations(doc, [
      action("GET", "api/app/book", "GetListAsync", "Book"),
      action("GET", "api/app/book/search", "GetListAsync", "Book"),
      action("GET", "api/app/book/{id}", "GetAsync", "Book"),
    ]);
    expect(operationIds(doc)).toEqual({
      "get /api/app/book": undefined,
      "get /api/app/book/search": undefined,
      "get /api/app/book/{id}": "bookGet",
    });
  });
});

describe("readAbpActions", () => {
  it("flattens modules and controllers, grouping by controllerGroupName", () => {
    const actions = readAbpActions({
      modules: {
        identity: {
          controllers: {
            "Volo.Abp.Identity.IdentityRoleController": {
              controllerName: "IdentityRole",
              controllerGroupName: "Role",
              actions: {
                GetListAsyncByInput: {
                  name: "GetListAsync",
                  httpMethod: "GET",
                  url: "api/identity/roles",
                },
              },
            },
          },
        },
      },
    });
    expect(actions).toEqual([action("GET", "api/identity/roles", "GetListAsync")]);
  });

  it("rejects a document that is not an api-definition", () => {
    expect(() => readAbpActions({ openapi: "3.0.1", paths: {} })).toThrow();
  });
});
