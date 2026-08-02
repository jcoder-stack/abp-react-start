import { describe, expect, it } from "vitest";
import { toAbpListParams, toPagedResult } from "../../src/core/paged";

describe("toPagedResult", () => {
  it("passes through items and totalCount", () => {
    expect(toPagedResult({ items: [{ id: "a" }], totalCount: 5 })).toEqual({
      items: [{ id: "a" }],
      totalCount: 5,
    });
  });

  it("defaults nullable/missing items and count to [] and 0", () => {
    expect(toPagedResult({ items: null, totalCount: undefined })).toEqual({
      items: [],
      totalCount: 0,
    });
    expect(toPagedResult(null)).toEqual({ items: [], totalCount: 0 });
    expect(toPagedResult(undefined)).toEqual({ items: [], totalCount: 0 });
  });
});

describe("toAbpListParams", () => {
  it("maps page index/size to SkipCount/MaxResultCount", () => {
    expect(toAbpListParams({ pageIndex: 2, pageSize: 20 })).toEqual({
      SkipCount: 40,
      MaxResultCount: 20,
    });
  });

  it.each([
    [
      "a negative page index",
      { pageIndex: -3, pageSize: 20 },
      { SkipCount: 0, MaxResultCount: 20 },
    ],
    ["a zero page size", { pageIndex: 2, pageSize: 0 }, { SkipCount: 2, MaxResultCount: 1 }],
    ["a negative page size", { pageIndex: 1, pageSize: -5 }, { SkipCount: 1, MaxResultCount: 1 }],
  ])("clamps %s into a range ABP accepts", (_label, state, expected) => {
    expect(toAbpListParams(state)).toEqual(expected);
  });

  it("joins sorting entries into the ABP sorting string", () => {
    expect(
      toAbpListParams({
        pageIndex: 0,
        pageSize: 10,
        sorting: [
          { id: "creationTime", desc: true },
          { id: "userName", desc: false },
        ],
      }).Sorting,
    ).toBe("creationTime desc,userName");
  });

  it("omits Sorting for an empty array and Filter for blank input", () => {
    const params = toAbpListParams({ pageIndex: 0, pageSize: 10, sorting: [], filter: "  " });
    expect(params.Sorting).toBeUndefined();
    expect(params.Filter).toBeUndefined();
  });

  it("passes a trimmed filter through", () => {
    expect(toAbpListParams({ pageIndex: 0, pageSize: 10, filter: " ad " }).Filter).toBe("ad");
  });
});
