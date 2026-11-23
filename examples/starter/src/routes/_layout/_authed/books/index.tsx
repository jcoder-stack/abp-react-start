import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CopyPlus, FileText, PackageCheck, PackageX } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { createAbpColumns } from "@/components/abp/table/column-presets";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";
import { localStoragePreferences } from "@/components/data-table/data-table-preferences";
import { DataTableSortMenu } from "@/components/data-table/data-table-sort-menu";
import {
  parseListSearch,
  parseQuerySearch,
  queryStore,
  searchListStore,
} from "@/components/data-table/list-search";
import { asBaseTable } from "@/components/data-table/table-core";
import { QueryDateRange } from "@/components/date-picker/query-date-range";
import { FieldHint, FieldLayout } from "@/components/form/field-layout";
import { FormCard } from "@/components/form/form-card";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getApiAppAuthor,
  getApiAppBook,
  getGetApiAppBookQueryKey,
  putApiAppBookId,
  setBookDemoScenario,
  useDeleteApiAppBookId,
  useGetApiAppAuthorId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/routes/_layout/_authed/books/-book-api";
import { exportBooksCsv } from "@/routes/_layout/_authed/books/-book-export";
import {
  BOOK_TAG_KEYS,
  BOOK_TYPE_KEYS,
  BOOK_TYPE_VALUES,
  bookSchema,
  bookTypeLabelKey,
  EMPTY_BOOK_VALUES,
  toBookInput,
  toBookValues,
} from "@/routes/_layout/_authed/books/-book-form";
import type { AbpSwaggerBooksBookDto } from "@/routes/_layout/_authed/books/-book-models";
import { type BookScenario, BookScenarioBar } from "@/routes/_layout/_authed/books/-book-scenarios";
import { BookDeleteButton } from "@/routes/_layout/_authed/books/-book-sheet-actions";
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

const QUERY_DEFAULTS = {
  Name: "",
  Type: "",
  MinPublishDate: "",
  MaxPublishDate: "",
  InStock: "",
};

/** demo 后端未给 book 端点定义权限策略,故 service 描述符省略 `policy`、每个 `source.can.*` 门都为 true。 */
export const Route = createFileRoute("/_layout/_authed/books/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseListSearch(search),
    ...parseQuerySearch(search, QUERY_DEFAULTS),
  }),
  component: BooksPage,
});

const bookService = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,
  fetchList: getApiAppBook,
  supportsFilter: false,
});

// 列定义走词条 key 而非 L()，因此不依赖 hook，可以留在模块级：引用天然稳定，
// 不必再包 useMemo，也就不存在「每渲染新数组重建列模型」那类退化。
const col = createAbpColumns<AbpSwaggerBooksBookDto>();
const columns = [
  col.primary("name", "App::BookName", { avatar: false }),
  col.text("authorName", "App::BookAuthor", { enableSorting: false }),
  col.enum("type", "App::BookType", {
    map: BOOK_TYPE_KEYS,
    fallback: "App::BookTypeUndefined",
    enableSorting: false,
  }),
  // 「在售」是记录当前所处的状态，配得上徽章；缺货用 neutral 而不是红色——它不是错误。
  col.bool("inStock", "App::BookInStock", { trueStatus: "success" }),
  col.number("stock", "App::BookStock"),
  col.date("publishDate", "App::BookPublishDate"),
  col.money("price", "App::BookPrice", { digits: 2 }),
  col.text("description", "App::BookDescription", { truncate: true, enableSorting: false }),
  col.datetime("lastModificationTime", "App::BookLastModified"),
];

// 「最后修改」默认收起：视图设置里勾上就出现，「恢复默认视图」再把它藏回去。
const TABLE_OPTIONS = {
  initialState: { columnVisibility: { lastModificationTime: false } },
};

const TAG_VALUES = Object.keys(BOOK_TAG_KEYS);

/** 在售的书先下架才能删：行菜单里不出「删除」，批量删除也会跳过它并在提示里交代。 */
function canDeleteBook(row: AbpSwaggerBooksBookDto): boolean {
  return row.inStock !== true;
}

function setInStock(row: AbpSwaggerBooksBookDto, inStock: boolean) {
  const values = toBookValues(row);
  // 上架却没有库存的书，库存补成 1：与表单里「在售必须有库存」的规则保持一致。
  const stock = inStock && (values.stock ?? 0) <= 0 ? 1 : values.stock;
  return putApiAppBookId(row.id ?? "", toBookInput({ ...values, inStock, stock }));
}

function BooksPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const L = useLocalization();

  const sheet = useAbpSheet(bookService, {
    emptyValues: EMPTY_BOOK_VALUES,
    // TDto 在 sheet 块里只有回调参数（逆变）位，调用点推不出具体 DTO 类型；本页在回调外读
    // sheet.record.authorId/authorName，故必须在此显式标注。
    toValues: (record: AbpSwaggerBooksBookDto) => toBookValues(record),
    toCreate: toBookInput,
    toUpdate: toBookInput,
    schema: () => bookSchema(L),
    continueCreate: true,
    title: (mode, record) => (mode === "create" ? L("App::BookCreateTitle") : (record?.name ?? "")),
    subtitle: (mode, record) =>
      mode === "create" || record === undefined
        ? undefined
        : [record.authorName, record.publishDate?.slice(0, 10)].filter(Boolean).join(" · "),
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

  const typeOptions = BOOK_TYPE_VALUES.map((value) => ({
    value: String(value),
    label: L(bookTypeLabelKey(value)),
  }));
  const tagOptions = TAG_VALUES.map((value) => ({
    value,
    label: L(BOOK_TAG_KEYS[value] ?? value),
  }));

  // 引用必须稳定：进 useAbpTable 的列 memo 依赖，内联箭头会让列模型每渲染重建。
  // 「复制为新书」用 create 模式打开、带上这条记录的值：保存走的是新建，不会改到原书。
  const { open } = sheet;
  const duplicateMenuItem = useCallback(
    (row: AbpSwaggerBooksBookDto) => (
      <DropdownMenuItem
        onSelect={() =>
          void open("create", { ...row, name: L("App::BookCopyName", row.name ?? "") })
        }
      >
        <CopyPlus />
        {L("App::BookDuplicate")}
      </DropdownMenuItem>
    ),
    [open, L],
  );

  const t = useAbpTable(bookService, {
    columns,
    tableOptions: TABLE_OPTIONS,
    selectable: true,
    query: {
      defaults: QUERY_DEFAULTS,
      store: queryStore(search, QUERY_DEFAULTS, (patch) =>
        navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
      ),
      summary: {
        Name: { label: L("App::BookName") },
        Type: { label: L("App::BookType"), format: (value) => L(bookTypeLabelKey(Number(value))) },
        MinPublishDate: { label: L("App::BookPublishedAfter") },
        MaxPublishDate: { label: L("App::BookPublishedBefore") },
        InStock: {
          label: L("App::BookInStock"),
          format: (value) => L(value === "true" ? "App::BookOnSale" : "App::BookOffSale"),
        },
      },
    },
    row: {
      menu: duplicateMenuItem,
      canDelete: canDeleteBook,
      deleteConfirm: L("App::BookDeleteConfirm"),
    },
    onOpen: sheet.open,
    onExport: (context) => {
      void exportBooksCsv(context, [
        L("App::BookName"),
        L("App::BookAuthor"),
        L("App::BookPublishDate"),
        L("App::BookPrice"),
        L("App::BookStock"),
        L("App::BookInStock"),
      ]).then((count) => toast.success(L("App::BookExported", count)));
    },
    list: searchListStore(search, (patch) =>
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
    ),
    preferences: localStoragePreferences("books"),
  });

  // 「跨页选择」要等新一页数据渲染出来才能勾：重取是异步的，勾选得落在那之后。
  const queryClient = useQueryClient();
  const pendingSelectAll = useRef(false);
  const pageItems = t.source.listQuery.data?.items;
  useEffect(() => {
    if (!pendingSelectAll.current || !pageItems?.length) return;
    pendingSelectAll.current = false;
    asBaseTable(t.table).getToggleAllPageRowsSelectedHandler()({ target: { checked: true } });
  }, [pageItems, t.table]);

  // 每个场景都从干净状态出发：清掉筛选、选择和视图改动，再叠上这个场景自己的那一步。
  const applyScenario = async (scenario: BookScenario) => {
    const table = asBaseTable(t.table);
    t.clearSelection();
    table.resetColumnVisibility();
    t.state.resetViewDefaults();
    setBookDemoScenario(scenario === "empty" ? "empty" : scenario === "long" ? "long" : "normal");
    const nextSearch =
      scenario === "filtered"
        ? { Type: "7", InStock: "true" }
        : scenario === "noMatch"
          ? { Name: L("App::BookScenarioNoMatchName") }
          : scenario === "long"
            ? { size: 50 }
            : {};
    await navigate({ search: nextSearch, replace: true });
    pendingSelectAll.current = scenario === "selectAll";
    await queryClient.resetQueries({ queryKey: getGetApiAppBookQueryKey() });
    if (scenario === "view") {
      t.state.setDensity("compact");
      table.getColumn("description")?.toggleVisibility(false);
    }
    if (scenario === "failing") {
      // 先有一份数据，再让刷新失败：这才是「旧数据还在、刷新没成功」的那个状态。
      setBookDemoScenario("failing");
      void t.source.listQuery.refetch?.();
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("App::Books")}</h1>
      <Tabs defaultValue="standard">
        {/* 三个层级名都长，窄屏放不下：外层自己横向滚，不撑出整页的横向滚动。滚动放在外层而不是
            TabsList 上：line 变体的下划线比页签条低出 2px，条本身一设 overflow，纵向也跟着变成
            可滚动，就多出一根竖滚动条；外层的 pb-1 把这 2px 收在内边距里。 */}
        <div className="overflow-x-auto overflow-y-hidden pb-1">
          <TabsList variant="line">
            <TabsTrigger value="standard">{L("App::BooksTierStandard")}</TabsTrigger>
            <TabsTrigger value="l1">{L("App::BooksTierL1")}</TabsTrigger>
            <TabsTrigger value="l2">{L("App::BooksTierL2")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="standard" className="space-y-4">
          <BookScenarioBar onApply={(scenario) => void applyScenario(scenario)} />
          <t.Table stickyHeader>
            <t.QueryForm>
              <t.queryForm.AppField name="Name">
                {(f) => <f.TextField label={L("App::BookName")} />}
              </t.queryForm.AppField>
              <t.queryForm.AppField name="Type">
                {(f) => (
                  <f.SelectField
                    label={L("App::BookType")}
                    options={[{ value: "", label: L("App::All") }, ...typeOptions]}
                  />
                )}
              </t.queryForm.AppField>
              <QueryDateRange
                form={t.queryForm}
                from="MinPublishDate"
                to="MaxPublishDate"
                label={L("App::BookPublishDate")}
              />
              <t.queryForm.AppField name="InStock">
                {(f) => (
                  <f.SelectField
                    label={L("App::BookInStock")}
                    options={[
                      { value: "", label: L("App::All") },
                      { value: "true", label: L("App::BookOnSale") },
                      { value: "false", label: L("App::BookOffSale") },
                    ]}
                  />
                )}
              </t.queryForm.AppField>
            </t.QueryForm>

            <t.BulkBar>
              <t.BulkAction
                label={L("App::BookPutOnSale")}
                icon={<PackageCheck />}
                run={(row) => setInStock(row, true)}
                canRun={(row) => row.inStock !== true}
              />
              <t.BulkAction
                label={L("App::BookTakeOffSale")}
                icon={<PackageX />}
                run={(row) => setInStock(row, false)}
                canRun={(row) => row.inStock === true}
              />
              <t.BulkDelete />
            </t.BulkBar>

            <t.Toolbar>
              {/* 整页表单入口：长表单或要深链分享的录入，不走抽屉。 */}
              <Button variant="outline" size="sm" className="max-md:hidden" asChild>
                <Link to="/books/new">
                  <FileText />
                  {L("App::BookFullPageForm")}
                </Link>
              </Button>
            </t.Toolbar>

            <t.Utility>
              <DataTableSortMenu table={t} />
            </t.Utility>
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
      <sheet.Sheet
        size="md"
        footerStart={
          record?.id && t.source.can.delete && t.source.delete && canDeleteBook(record) ? (
            <BookDeleteButton
              id={record.id}
              remove={t.source.delete.mutate}
              onDeleted={() => sheet.close({ force: true })}
            />
          ) : undefined
        }
        footerEnd={
          record && t.source.can.create ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void sheet.open("create", {
                  ...record,
                  name: L("App::BookCopyName", record.name ?? ""),
                })
              }
            >
              <CopyPlus />
              {L("App::BookDuplicate")}
            </Button>
          ) : undefined
        }
      >
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <FormCard title={L("App::BookSectionBasics")}>
          <sheet.form.AppField name="name">
            {(field) => (
              <field.TextField
                label={L("App::BookName")}
                placeholder={L("App::BookNamePlaceholder")}
                required
                disabled={sheet.readOnly}
              />
            )}
          </sheet.form.AppField>

          <FieldLayout className="grid gap-4 sm:grid-cols-2">
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
                  description={L("App::BookTypeHint")}
                  options={typeOptions}
                  disabled={sheet.readOnly}
                />
              )}
            </sheet.form.AppField>
          </FieldLayout>

          <sheet.form.AppField name="tags">
            {(field) => (
              <field.MultiComboboxField
                label={L("App::BookTags")}
                options={tagOptions}
                placeholder={L("App::BookTagsPlaceholder")}
              />
            )}
          </sheet.form.AppField>

          <sheet.form.AppField name="description">
            {(field) => (
              <field.TextareaField
                label={L("App::BookDescription")}
                placeholder={L("App::BookDescriptionPlaceholder")}
                rows={3}
                disabled={sheet.readOnly}
              />
            )}
          </sheet.form.AppField>
        </FormCard>

        <FormCard title={L("App::BookSectionPricing")}>
          <FieldLayout className="grid gap-4 sm:grid-cols-2">
            <sheet.form.AppField name="publishDate">
              {(field) => (
                <field.DateField
                  label={L("App::BookPublishDate")}
                  required
                  disabled={sheet.readOnly}
                />
              )}
            </sheet.form.AppField>

            <sheet.form.AppField name="price">
              {(field) => (
                <field.NumberField
                  label={L("App::BookPrice")}
                  placeholder={L("App::BookPricePlaceholder")}
                  step="0.01"
                  digits={2}
                  required
                  disabled={sheet.readOnly}
                />
              )}
            </sheet.form.AppField>
          </FieldLayout>
        </FormCard>

        <FormCard title={L("App::BookSectionSales")} description={L("App::BookSectionSalesHint")}>
          <sheet.form.AppField name="inStock">
            {(field) => (
              <field.SwitchField
                label={L("App::BookInStock")}
                description={L("App::BookInStockHint")}
                disabled={sheet.readOnly}
              />
            )}
          </sheet.form.AppField>

          <sheet.form.AppField name="stock">
            {(field) => (
              <field.NumberField
                label={L("App::BookStock")}
                step="1"
                nullable
                disabled={sheet.readOnly}
              />
            )}
          </sheet.form.AppField>

          <FieldLayout className="grid gap-4 sm:grid-cols-2">
            <sheet.form.AppField name="saleStartsAt">
              {(field) => (
                <field.DateTimeField label={L("App::BookSaleStartsAt")} disabled={sheet.readOnly} />
              )}
            </sheet.form.AppField>

            <sheet.form.AppField name="promo">
              {(field) => (
                <field.DateRangeField label={L("App::BookPromo")} disabled={sheet.readOnly} />
              )}
            </sheet.form.AppField>
          </FieldLayout>
          <FieldHint>{L("App::BookPromoHint")}</FieldHint>
        </FormCard>
      </sheet.Sheet>
    </section>
  );
}
