import type { PagedResult } from "@jcoder/abp-react/core";
import { useLocalization } from "@jcoder/abp-react/react";
import { type keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import {
  createCrudService,
  type ListParams,
  type PagedResultLike,
} from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";

interface DemoBook {
  id: string;
  name: string;
  author: string;
  price: number;
}

type DemoBookInput = Omit<DemoBook, "id">;

const SEED: DemoBook[] = [
  { id: "1", name: "1984", author: "George Orwell", price: 19.9 },
  { id: "2", name: "Foundation", author: "Isaac Asimov", price: 24 },
  { id: "3", name: "The Left Hand of Darkness", author: "Ursula K. Le Guin", price: 18 },
  { id: "4", name: "Pride and Prejudice", author: "Jane Austen", price: 9.99 },
  { id: "5", name: "I, Robot", author: "Isaac Asimov", price: 21.5 },
  { id: "6", name: "A Wizard of Earthsea", author: "Ursula K. Le Guin", price: 15.75 },
  { id: "7", name: "Animal Farm", author: "George Orwell", price: 12.5 },
];

// 数据只能留在浏览器里：整块 app-shell 会被 jc-abp init 装进用户项目，这个文件不能引任何后端、
// 也不能引示例应用独有的模块。改动活到下次刷新为止。
let rows: DemoBook[] = [...SEED];
let nextId = SEED.length;

const LIST_KEY = ["showcase", "books"] as const;
const PAGE_SIZE = 5;

/** 按 ABP 的列表协议算：Filter 子串匹配、Sorting 表达式、SkipCount/MaxResultCount 切片。 */
async function listBooks(params: ListParams): Promise<PagedResult<DemoBook>> {
  const filter = params.Filter?.trim().toLowerCase();
  let matched = filter
    ? rows.filter(
        (b) => b.name.toLowerCase().includes(filter) || b.author.toLowerCase().includes(filter),
      )
    : rows;
  const [field, direction] = (params.Sorting ?? "").trim().split(/\s+/);
  if (field === "name" || field === "price") {
    const desc = direction?.toLowerCase() === "desc";
    matched = [...matched].sort((a, b) => {
      const order = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
      return desc ? -order : order;
    });
  }
  const skip = params.SkipCount ?? 0;
  const take = params.MaxResultCount ?? PAGE_SIZE;
  return { items: matched.slice(skip, skip + take), totalCount: matched.length };
}

interface MutationCallbacks {
  mutation?: { onSuccess?: () => void; onError?: () => void };
}

// 具名 hook + 显式签名，形状与 orval 的产物一致。描述符收的是 hook 引用，内联箭头函数会让
// TDto 与 options.select 互相等待、推断成死循环。
function useGetDemoBooks(
  params: ListParams,
  options?: {
    query?: {
      placeholderData?: typeof keepPreviousData;
      select?: (raw: PagedResultLike<DemoBook>) => PagedResult<DemoBook>;
    };
  },
) {
  return useQuery({
    queryKey: [...LIST_KEY, params],
    queryFn: () => listBooks(params),
    ...options?.query,
  });
}

function usePostDemoBook(options?: MutationCallbacks) {
  return useMutation({
    mutationFn: async (v: { data: DemoBookInput }) => {
      nextId += 1;
      const created: DemoBook = { id: String(nextId), ...v.data };
      rows = [created, ...rows];
      return created;
    },
    ...options?.mutation,
  });
}

function usePutDemoBook(options?: MutationCallbacks) {
  return useMutation({
    mutationFn: async (v: { id: string; data: DemoBookInput }) => {
      rows = rows.map((b) => (b.id === v.id ? { ...b, ...v.data } : b));
      return rows.find((b) => b.id === v.id);
    },
    ...options?.mutation,
  });
}

function useDeleteDemoBook(options?: MutationCallbacks) {
  return useMutation({
    mutationFn: async (v: { id: string }) => {
      rows = rows.filter((b) => b.id !== v.id);
      return null;
    },
    ...options?.mutation,
  });
}

/**
 * 描述符收的是 react-query hook，数据源是什么在这一层并不重要：真实项目里这四个位置填 orval
 * 生成的 hook，这里填包着内存数组的同形 hook，页面代码一字不差。
 * 不带 `policy`，所以 `source.can.*` 全为 true。带权限的门控见管理后台各页。
 */
const demoService = createCrudService({
  useList: useGetDemoBooks,
  useCreate: usePostDemoBook,
  useUpdate: usePutDemoBook,
  useDelete: useDeleteDemoBook,
  listKey: () => LIST_KEY,
});

const EMPTY_VALUES: DemoBookInput = { name: "", author: "", price: 0 };

/** abp-table 展示：真的 `useAbpTable` + `useAbpSheet`：搜索、排序、翻页、新建/编辑/详情抽屉、
 *  行删除与批量删除全程可点，全本地、不打后端。 */
export function AbpTableDemo() {
  const L = useLocalization();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, L("Form:Required")),
        author: z.string().trim().min(1, L("Form:Required")),
        price: z.number().min(0),
      }),
    [L],
  );

  const columns = useMemo<TableColumnDef<DemoBook>[]>(
    () => [
      { accessorKey: "name", header: () => L("Showcase:ColBookName") },
      { accessorKey: "author", header: () => L("Showcase:ColBookAuthor"), enableSorting: false },
      {
        accessorKey: "price",
        header: () => L("Showcase:ColBookPrice"),
        meta: { align: "right" },
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
    ],
    [L],
  );

  const sheet = useAbpSheet(demoService, { emptyValues: EMPTY_VALUES, schema: () => schema });
  const t = useAbpTable(demoService, {
    columns,
    selectable: true,
    defaultPageSize: PAGE_SIZE,
    onOpen: sheet.open,
  });

  return (
    <>
      <t.Table pageSizes={[5, 10]}>
        <t.BulkBar>
          <t.BulkDelete />
        </t.BulkBar>
      </t.Table>
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField label={L("Showcase:ColBookName")} required disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="author">
          {(field) => (
            <field.TextField
              label={L("Showcase:ColBookAuthor")}
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="price">
          {(field) => (
            <field.NumberField label={L("Showcase:ColBookPrice")} disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>
      </sheet.Sheet>
    </>
  );
}
