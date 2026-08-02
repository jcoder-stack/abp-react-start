import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  AbpSwaggerAuthorsAuthorDto,
  AbpSwaggerBooksBookDto,
  AbpSwaggerBooksBookType,
  AbpSwaggerBooksCreateUpdateBookDto,
  GetApiAppAuthorParams,
  GetApiAppBookParams,
} from "@/routes/_layout/_authed/books/-book-models";

/**
 * Book/Author 演示自带的进程内后端：一份种子数据 + 一组 server function + 与 orval 产物同名同形的 hook。
 *
 * **为什么不走 `jc-abp gen`**：Book/Author 是 ABP BookStore 教程独有的端点，`abp new` 产出的
 * 后端没有它们。真按 swagger 生成，换一个后端重放 starter 就会编不过，而 `src/api` 每次
 * `jc-abp gen` 都整体重写，这几个演示页却是手写增量，两者的生命周期对不上。
 *
 * 于是这里手写出与 orval 产物**同名同形**的 hook（`useGetApiAppBook`、`usePostApiAppBook`……），
 * 页面代码因此与「真实项目里由 gen 产出的样子」逐字一致，演示本身却不绑任何后端。
 * **你自己的实体请走 `jc-abp gen`，不要照抄本文件。**
 *
 * 分页、排序、筛选一律在 server function 里算：L1/L2 两层演示的全部意义就在这个服务端边界上，
 * 改成客户端切片会让它们变成假的。
 */

interface AbpValidationError {
  message: string;
  members: string[];
}

/** ABP 的错误信封形状；`abpErrorToFieldErrors` 认的就是这个 `validationErrors` 数组。 */
interface AbpErrorEnvelope {
  validationErrors: AbpValidationError[];
}

const AUTHORS: AbpSwaggerAuthorsAuthorDto[] = [
  { id: "a1000000-0000-4000-8000-000000000001", name: "George Orwell", birthDate: "1903-06-25" },
  { id: "a1000000-0000-4000-8000-000000000002", name: "Isaac Asimov", birthDate: "1920-01-02" },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    name: "Ursula K. Le Guin",
    birthDate: "1929-10-21",
  },
  { id: "a1000000-0000-4000-8000-000000000004", name: "Douglas Adams", birthDate: "1952-03-11" },
  { id: "a1000000-0000-4000-8000-000000000005", name: "Jane Austen", birthDate: "1775-12-16" },
];

function seedBooks(): AbpSwaggerBooksBookDto[] {
  const rows: [string, number, number, string, number][] = [
    ["1984", 0, 3, "1949-06-08", 19.9],
    ["Animal Farm", 0, 3, "1945-08-17", 12.5],
    ["Foundation", 1, 7, "1951-06-01", 24],
    ["I, Robot", 1, 7, "1950-12-02", 21.5],
    ["The Left Hand of Darkness", 2, 7, "1969-03-01", 18],
    ["A Wizard of Earthsea", 2, 4, "1968-11-01", 15.75],
    ["The Hitchhiker's Guide to the Galaxy", 3, 7, "1979-10-12", 14.99],
    ["Dirk Gently's Holistic Detective Agency", 3, 1, "1987-06-01", 16.4],
    ["Pride and Prejudice", 4, 1, "1813-01-28", 9.99],
    ["Emma", 4, 1, "1815-12-23", 11.2],
    ["Persuasion", 4, 1, "1817-12-20", 10.5],
    ["The Dispossessed", 2, 7, "1974-05-01", 20.25],
  ];
  return rows.map(([name, authorIndex, type, publishDate, price], index) => {
    const author = AUTHORS[authorIndex];
    return {
      id: `b1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      creationTime: `${publishDate}T00:00:00Z`,
      name,
      authorId: author?.id,
      authorName: author?.name,
      type: type as AbpSwaggerBooksBookType,
      publishDate: `${publishDate}T00:00:00Z`,
      price,
    };
  });
}

// 进程内数据集：改动活到进程退出为止，重启即回到种子状态。演示要的是「请求真的过了服务端」
// 这条链路，不是持久化。
let books = seedBooks();
let nextId = books.length;

function authorNameOf(authorId: string | undefined): string | null {
  return AUTHORS.find((a) => a.id === authorId)?.name ?? null;
}

/** ABP 的 `Sorting` 是 `"field"` / `"field desc"` / 逗号分隔的多字段表达式。 */
function applySorting(
  rows: AbpSwaggerBooksBookDto[],
  sorting: string | undefined,
): AbpSwaggerBooksBookDto[] {
  if (!sorting?.trim()) return rows;
  const terms = sorting
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => {
      const [field = "", direction] = term.split(/\s+/);
      return { field, desc: direction?.toLowerCase() === "desc" };
    });
  return [...rows].sort((a, b) => {
    for (const { field, desc } of terms) {
      const left = a[field as keyof AbpSwaggerBooksBookDto];
      const right = b[field as keyof AbpSwaggerBooksBookDto];
      if (left === right) continue;
      // 空值一律排在后面，不参与大小比较，否则 null/undefined 会被 < 静默当成 0/NaN 参与排序。
      if (left === undefined || left === null) return 1;
      if (right === undefined || right === null) return -1;
      const order = left < right ? -1 : 1;
      return desc ? -order : order;
    }
    return 0;
  });
}

const listBooksSchema = z.object({
  Name: z.string().optional(),
  MinPublishDate: z.string().optional(),
  Sorting: z.string().optional(),
  SkipCount: z.number().optional(),
  MaxResultCount: z.number().optional(),
});

export const listBooksFn = createServerFn({ method: "GET" })
  .validator(listBooksSchema)
  .handler(({ data }) => {
    const name = data.Name?.trim().toLowerCase();
    const minPublishDate = data.MinPublishDate?.trim();
    let rows = books;
    if (name) rows = rows.filter((b) => (b.name ?? "").toLowerCase().includes(name));
    if (minPublishDate) rows = rows.filter((b) => (b.publishDate ?? "") >= minPublishDate);
    rows = applySorting(rows, data.Sorting);
    const skip = data.SkipCount ?? 0;
    const take = data.MaxResultCount ?? 10;
    return { items: rows.slice(skip, skip + take), totalCount: rows.length };
  });

const bookBodySchema = z.object({
  name: z.string().optional(),
  authorId: z.string().optional(),
  type: z.number().optional(),
  publishDate: z.string().optional(),
  price: z.number().optional(),
});

/** 复刻 ABP 的必填校验：`new.tsx` 只提交 name，靠这里退回的 members 演示服务端错误落到字段上。 */
function validate(body: z.infer<typeof bookBodySchema>): AbpValidationError[] {
  const errors: AbpValidationError[] = [];
  if (!body.name?.trim())
    errors.push({ message: "The Name field is required.", members: ["Name"] });
  if (!body.authorId)
    errors.push({ message: "The AuthorId field is required.", members: ["AuthorId"] });
  if (body.type === undefined)
    errors.push({ message: "The Type field is required.", members: ["Type"] });
  if (!body.publishDate)
    errors.push({ message: "The PublishDate field is required.", members: ["PublishDate"] });
  if (body.price === undefined)
    errors.push({ message: "The Price field is required.", members: ["Price"] });
  return errors;
}

/** 校验失败经**返回值**回传而非 throw：server function 的抛错跨 RPC 会被压成普通 Error，
 *  `validationErrors` 结构留不下来。客户端包装再把它抛成 ABP 形状（见 `unwrap`）。 */
type WriteResult =
  | { ok: true; data: AbpSwaggerBooksBookDto }
  | { ok: false; error: AbpErrorEnvelope };

export const createBookFn = createServerFn({ method: "POST" })
  .validator(bookBodySchema)
  .handler(({ data }): WriteResult => {
    const errors = validate(data);
    if (errors.length > 0) return { ok: false, error: { validationErrors: errors } };
    nextId += 1;
    const created: AbpSwaggerBooksBookDto = {
      id: `b1000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
      creationTime: new Date().toISOString(),
      name: data.name,
      authorId: data.authorId,
      authorName: authorNameOf(data.authorId),
      type: data.type as AbpSwaggerBooksBookType,
      publishDate: data.publishDate,
      price: data.price,
    };
    books = [created, ...books];
    return { ok: true, data: created };
  });

export const updateBookFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), body: bookBodySchema }))
  .handler(({ data }): WriteResult => {
    const errors = validate(data.body);
    if (errors.length > 0) return { ok: false, error: { validationErrors: errors } };
    const existing = books.find((b) => b.id === data.id);
    if (!existing) {
      return {
        ok: false,
        error: { validationErrors: [{ message: "Book not found.", members: [] }] },
      };
    }
    const updated: AbpSwaggerBooksBookDto = {
      ...existing,
      name: data.body.name,
      authorId: data.body.authorId,
      authorName: authorNameOf(data.body.authorId),
      type: data.body.type as AbpSwaggerBooksBookType,
      publishDate: data.body.publishDate,
      price: data.body.price,
    };
    books = books.map((b) => (b.id === data.id ? updated : b));
    return { ok: true, data: updated };
  });

export const deleteBookFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => {
    books = books.filter((b) => b.id !== data.id);
    return null;
  });

export const listAuthorsFn = createServerFn({ method: "GET" })
  .validator(z.object({ SkipCount: z.number().optional(), MaxResultCount: z.number().optional() }))
  .handler(({ data }) => {
    const skip = data.SkipCount ?? 0;
    const take = data.MaxResultCount ?? 10;
    return { items: AUTHORS.slice(skip, skip + take), totalCount: AUTHORS.length };
  });

export const getAuthorFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => AUTHORS.find((a) => a.id === data.id) ?? null);

function unwrap(result: WriteResult): AbpSwaggerBooksBookDto {
  if (result.ok) return result.data;
  throw result.error;
}

/** 以下导出与 orval 产物同名同形：页面代码因此与真实项目里的写法逐字一致。 */

export const getGetApiAppBookQueryKey = (params?: GetApiAppBookParams) =>
  ["/api/app/book", ...(params ? [params] : [])] as const;

export function useGetApiAppBook<TData = { items: AbpSwaggerBooksBookDto[]; totalCount: number }>(
  params: GetApiAppBookParams,
  options?: {
    query?: Partial<
      UseQueryOptions<{ items: AbpSwaggerBooksBookDto[]; totalCount: number }, Error, TData>
    >;
  },
) {
  return useQuery({
    queryKey: getGetApiAppBookQueryKey(params),
    queryFn: () => listBooksFn({ data: params }),
    ...options?.query,
  });
}

export const postApiAppBook = async (body: AbpSwaggerBooksCreateUpdateBookDto) =>
  unwrap(await createBookFn({ data: body }));

export function usePostApiAppBook(options?: {
  mutation?: Partial<
    UseMutationOptions<AbpSwaggerBooksBookDto, Error, { data: AbpSwaggerBooksCreateUpdateBookDto }>
  >;
}) {
  return useMutation({
    mutationFn: (variables: { data: AbpSwaggerBooksCreateUpdateBookDto }) =>
      postApiAppBook(variables.data),
    ...options?.mutation,
  });
}

export function usePutApiAppBookId(options?: {
  mutation?: Partial<
    UseMutationOptions<
      AbpSwaggerBooksBookDto,
      Error,
      { id: string; data: AbpSwaggerBooksCreateUpdateBookDto }
    >
  >;
}) {
  return useMutation({
    mutationFn: async (variables: { id: string; data: AbpSwaggerBooksCreateUpdateBookDto }) =>
      unwrap(await updateBookFn({ data: { id: variables.id, body: variables.data } })),
    ...options?.mutation,
  });
}

export function useDeleteApiAppBookId(options?: {
  mutation?: Partial<UseMutationOptions<null, Error, { id: string }>>;
}) {
  return useMutation({
    mutationFn: (variables: { id: string }) => deleteBookFn({ data: { id: variables.id } }),
    ...options?.mutation,
  });
}

export const getApiAppAuthor = (params: GetApiAppAuthorParams) => listAuthorsFn({ data: params });

export function useGetApiAppAuthorId(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<AbpSwaggerAuthorsAuthorDto | null, Error>>;
  },
) {
  return useQuery({
    queryKey: ["/api/app/author", id] as const,
    queryFn: () => getAuthorFn({ data: { id } }),
    ...options?.query,
  });
}
