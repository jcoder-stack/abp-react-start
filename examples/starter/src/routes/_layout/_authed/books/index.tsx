import { useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getApiAppAuthor,
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppAuthorId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/routes/_layout/_authed/books/-book-api";
import type {
  AbpSwaggerBooksBookDto,
  AbpSwaggerBooksCreateUpdateBookDto,
} from "@/routes/_layout/_authed/books/-book-models";
import {
  postApiAppBookBody,
  postApiAppBookBodyNameMax,
} from "@/routes/_layout/_authed/books/-book-models";
import { BooksL1Demo } from "@/routes/_layout/_authed/books/-tiers/books-l1-demo";
import { BooksL2Demo } from "@/routes/_layout/_authed/books/-tiers/books-l2-demo";

/** author 端点搜索 top-N 时取的批大小；结合客户端子串过滤当作"退化搜索"（见 loadAuthorOptions）。 */
const AUTHOR_PAGE_SIZE = 20;

/**
 * 作者下拉的远程 loadOptions：`GetApiAppAuthorParams`（见 `-book-models.ts`）只有
 * Sorting/SkipCount/MaxResultCount，没有 Filter 字段，mock 后端照搬 ABP demo 的 author 端点，
 * 同样不支持服务端过滤。退化为固定取前 `AUTHOR_PAGE_SIZE` 条 + 客户端子串过滤（不区分大小写），
 * 而不是伪造一个服务端不支持的参数。
 */
async function loadAuthorOptions(search: string): Promise<ComboboxOption[]> {
  const result = await getApiAppAuthor({ SkipCount: 0, MaxResultCount: AUTHOR_PAGE_SIZE });
  const items = result.items ?? [];
  const query = search.trim().toLowerCase();
  const filtered = query
    ? items.filter((a) => (a.name ?? "").toLowerCase().includes(query))
    : items;
  return filtered.map((a) => ({ value: a.id ?? "", label: a.name ?? "" }));
}

/** demo 后端未给 book 端点定义权限策略,故 service 描述符省略 `policy`、每个 `source.can.*` 门都为 true。 */
export const Route = createFileRoute("/_layout/_authed/books/")({
  component: BooksPage,
});

const bookService = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

/** ABP demo BookStore 的图书类型枚举（0–8）；文案取自 App:: 词条桶。 */
const BOOK_TYPE_KEYS: Record<number, string> = {
  0: "App::BookTypeUndefined",
  1: "App::BookTypeAdventure",
  2: "App::BookTypeBiography",
  3: "App::BookTypeDystopia",
  4: "App::BookTypeFantastic",
  5: "App::BookTypeHorror",
  6: "App::BookTypeScience",
  7: "App::BookTypeScienceFiction",
  8: "App::BookTypePoetry",
};
const BOOK_TYPE_VALUES = Object.keys(BOOK_TYPE_KEYS).map(Number);

function bookTypeLabelKey(value: number | undefined): string {
  return BOOK_TYPE_KEYS[value ?? 0] ?? "App::BookTypeUndefined";
}

interface BookFormValues {
  name: string;
  authorId: string;
  type: string;
  publishDate: string;
  price: number;
}

const EMPTY_VALUES: BookFormValues = {
  name: "",
  authorId: "",
  type: "0",
  publishDate: "",
  price: 0,
};

/** 不能走默认：SelectField 是 string 值域（枚举 String/Number 往返）、publishDate 需 date-only 切片。 */
function toRecordValues(record: AbpSwaggerBooksBookDto): BookFormValues {
  return {
    name: record.name ?? "",
    authorId: record.authorId ?? "",
    type: String(record.type ?? 0),
    // publishDate 回来的是完整 ISO datetime，而 <input type="date"> 与 create/update 的 body
    // schema（zod.iso.date()）都只要 "YYYY-MM-DD" 这段日期切片。
    publishDate: record.publishDate ? record.publishDate.slice(0, 10) : "",
    price: record.price ?? 0,
  };
}

/** 不能走默认：SelectField 是 string 值域（枚举 String/Number 往返）、publishDate 需 date-only 切片；
 *  create/update 共用同一映射，故命名为 toInput 而非 toCreateInput/toUpdateInput。 */
function toInput(value: BookFormValues): AbpSwaggerBooksCreateUpdateBookDto {
  return {
    ...value,
    type: Number(value.type) as AbpSwaggerBooksCreateUpdateBookDto["type"],
  };
}

function BooksPage() {
  const L = useLocalization();

  // 以生成的 body schema 为基底：max(128) 这类后端约束免费继承；`type` 是表单 SelectField 的
  // string 值域，与生成侧的 number literal union 冲突，omit 后重声明；authorId/publishDate 用
  // `.extend()` 整键替换成 z.string().min(1, 词条)，extend 是替换不是叠加，生成侧的
  // uuid()/iso.date() 校验随之让位；这里可以接受：值域由 Combobox 选项与 date input 保证，
  // 表单侧只需必填语义。
  const bookSchema = postApiAppBookBody.omit({ type: true }).extend({
    type: z.string(),
    name: z
      .string()
      .trim()
      .min(1, L("App::BookNameRequired"))
      .max(postApiAppBookBodyNameMax, L("Form:MaxLength", postApiAppBookBodyNameMax)),
    authorId: z.string().min(1, L("App::BookAuthorRequired")),
    publishDate: z.string().min(1, L("App::BookPublishDateRequired")),
    price: z.number(L("App::BookPriceRequired")).min(0, L("App::BookPriceInvalid")),
  });

  const sheet = useAbpSheet(bookService, {
    emptyValues: EMPTY_VALUES,
    // TDto 在 sheet 块里只有回调参数（逆变）位，调用点推不出具体 DTO 类型；本页在回调外读
    // sheet.record.authorId/authorName，故必须在此显式标注。
    toValues: (record: AbpSwaggerBooksBookDto) => toRecordValues(record),
    toCreate: toInput,
    toUpdate: toInput,
    schema: () => bookSchema,
  });

  // 编辑/详情态已选作者名回显：AbpSwaggerBooksBookDto 自带 authorName（列表/详情复用同一 DTO，
  // mock 后端照 ABP demo 的 BookAppService 一并带上），优先直接拿来当缓存 label 种子；只有它缺失时才
  // 按需 get 明细补一次（enabled 门控避免每次渲染都发请求）。
  const record = sheet.record;
  const authorNameFallback = useGetApiAppAuthorId(record?.authorId ?? "", {
    query: { enabled: Boolean(record?.authorId) && !record?.authorName },
  });
  const authorSeed: ComboboxOption[] = record?.authorId
    ? [
        {
          value: record.authorId,
          label: record.authorName ?? authorNameFallback.data?.name ?? record.authorId,
        },
      ]
    : [];

  const columns = useMemo<TableColumnDef<AbpSwaggerBooksBookDto>[]>(
    () => [
      { accessorKey: "name", header: () => L("App::BookName") },
      { accessorKey: "authorName", header: () => L("App::BookAuthor"), enableSorting: false },
      {
        accessorKey: "type",
        header: () => L("App::BookType"),
        enableSorting: false,
        cell: ({ getValue }) => L(bookTypeLabelKey(getValue() as number | undefined)),
      },
      {
        accessorKey: "publishDate",
        header: () => L("App::BookPublishDate"),
        cell: ({ getValue }) => {
          const value = getValue() as string | undefined;
          return value ? value.slice(0, 10) : "";
        },
      },
      {
        accessorKey: "price",
        header: () => L("App::BookPrice"),
        meta: { align: "right" },
        cell: ({ getValue }) => {
          const value = getValue() as number | undefined;
          return typeof value === "number" ? value.toFixed(2) : "";
        },
      },
    ],
    [L],
  );

  // `GetApiAppBookParams` 只有 Name/MinPublishDate 两个端点自有查询参数，没有 MaxPublishDate
  // 上界字段（`docs/guides/abp-table.md` 的 QueryDateRange 示例特地注明那是假设端点多一个字段
  // 才用得上的演示），故这里只声明这两个真实字段，不伪造一个后端会静默丢弃的 MaxPublishDate。
  const t = useAbpTable(bookService, {
    columns,
    selectable: true,
    query: { defaults: { Name: "", MinPublishDate: "" } },
    onOpen: sheet.open,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("App::Books")}</h1>
      <Tabs defaultValue="standard">
        <TabsList variant="line">
          <TabsTrigger value="standard">{L("App::BooksTierStandard")}</TabsTrigger>
          <TabsTrigger value="l1">{L("App::BooksTierL1")}</TabsTrigger>
          <TabsTrigger value="l2">{L("App::BooksTierL2")}</TabsTrigger>
        </TabsList>
        <TabsContent value="standard">
          <t.Table>
            <t.QueryForm>
              <t.queryForm.AppField name="Name">
                {(f) => <f.TextField label={L("App::BookName")} />}
              </t.queryForm.AppField>
              <t.queryForm.AppField name="MinPublishDate">
                {(f) => <f.DateField label={L("App::BookPublishedAfter")} />}
              </t.queryForm.AppField>
            </t.QueryForm>

            <t.BulkBar>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast.success(L("App::ExportSelected", t.selectedRows.length))}
              >
                {L("App::ExportSelected", t.selectedRows.length)}
              </Button>
              <t.BulkDelete />
            </t.BulkBar>
          </t.Table>
        </TabsContent>
        <TabsContent value="l1" className="space-y-2">
          <p className="text-sm text-muted-foreground">{L("App::BooksTierL1Hint")}</p>
          <BooksL1Demo />
        </TabsContent>
        <TabsContent value="l2" className="space-y-2">
          <p className="text-sm text-muted-foreground">{L("App::BooksTierL2Hint")}</p>
          <BooksL2Demo />
        </TabsContent>
      </Tabs>
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField label={L("App::BookName")} required disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="authorId">
          {(field) => (
            <field.ComboboxField
              label={L("App::BookAuthor")}
              required
              options={authorSeed}
              loadOptions={loadAuthorOptions}
              placeholder={L("App::BookAuthorPlaceholder")}
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="type">
          {(field) => (
            <field.SelectField
              label={L("App::BookType")}
              options={BOOK_TYPE_VALUES.map((value) => ({
                value: String(value),
                label: L(bookTypeLabelKey(value)),
              }))}
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="publishDate">
          {(field) => (
            <field.TextField
              label={L("App::BookPublishDate")}
              type="date"
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="price">
          {(field) => (
            <field.NumberField
              label={L("App::BookPrice")}
              step="0.01"
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>
      </sheet.Sheet>
    </section>
  );
}
