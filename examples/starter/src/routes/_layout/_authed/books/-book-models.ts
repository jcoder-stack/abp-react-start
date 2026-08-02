import { z } from "zod";

/**
 * Book/Author 演示的类型与 body schema，对应 orval 产出的 `api/models` + `api/schemas` 两层。
 * 与端点分开成文件不只是照搬 orval 的布局：`-book-api.ts` 里有 `createServerFn`，而仓库的
 * vitest 没装 TanStack Start 插件、加载不了 server function 模块。页面要真用的 schema 放这里，
 * 组件测试才能整体 mock 掉端点模块、同时拿到真的 `postApiAppBookBody`。
 *
 * **你自己的实体请走 `jc-abp gen`，不要照抄本文件。** 缘由见 `-book-api.ts` 顶部。
 */

export const AbpSwaggerBooksBookType = {
  NUMBER_0: 0,
  NUMBER_1: 1,
  NUMBER_2: 2,
  NUMBER_3: 3,
  NUMBER_4: 4,
  NUMBER_5: 5,
  NUMBER_6: 6,
  NUMBER_7: 7,
  NUMBER_8: 8,
} as const;

export type AbpSwaggerBooksBookType =
  (typeof AbpSwaggerBooksBookType)[keyof typeof AbpSwaggerBooksBookType];

export interface AbpSwaggerBooksBookDto {
  id?: string;
  creationTime?: string;
  /** @nullable */
  name?: string | null;
  authorId?: string;
  /** @nullable */
  authorName?: string | null;
  type?: AbpSwaggerBooksBookType;
  publishDate?: string;
  price?: number;
}

export interface AbpSwaggerBooksCreateUpdateBookDto {
  name: string;
  authorId: string;
  type: AbpSwaggerBooksBookType;
  publishDate: string;
  price: number;
}

export interface AbpSwaggerAuthorsAuthorDto {
  id?: string;
  /** @nullable */
  name?: string | null;
  birthDate?: string;
  /** @nullable */
  shortBio?: string | null;
}

export type GetApiAppBookParams = {
  Name?: string;
  MinPublishDate?: string;
  Sorting?: string;
  SkipCount?: number;
  MaxResultCount?: number;
};

export type GetApiAppAuthorParams = {
  Sorting?: string;
  SkipCount?: number;
  MaxResultCount?: number;
};

export const postApiAppBookBodyNameMax = 128;

/** 与 orval 从 swagger 生成的 body schema 同形：页面用它当基底，`.omit`/`.extend` 出表单 schema。 */
export const postApiAppBookBody = z.object({
  name: z.string().min(0).max(postApiAppBookBodyNameMax),
  authorId: z.string(),
  type: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
  ]),
  publishDate: z.string(),
  price: z.number(),
});
