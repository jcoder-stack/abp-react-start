import { toAbpListParams } from "@jcoder-stack/abp-react/core";
import { useLocalization } from "@jcoder-stack/abp-react/react";
import { keepPreviousData } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import {
  type DataTableFilterChip,
  DataTableFilterChips,
  DataTableFilterPanel,
  DataTableFilterToggle,
} from "@/components/data-table/data-table-filter";
import { DataTableSortMenu } from "@/components/data-table/data-table-sort-menu";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableViewMenu } from "@/components/data-table/data-table-view-menu";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetApiAppBook } from "@/routes/_layout/_authed/books/-book-api";
import { BOOK_TYPE_VALUES, bookTypeLabelKey } from "@/routes/_layout/_authed/books/-book-form";
import type {
  AbpSwaggerBooksBookDto,
  GetApiAppBookParams,
} from "@/routes/_layout/_authed/books/-book-models";

interface Filters {
  type: string;
  inStock: string;
}

const NO_FILTERS: Filters = { type: "", inStock: "" };
// Radix Select 把 "" 当成未选，「全部」要一个非空的哨兵值；它只活在这个控件里，不进请求。
const ANY = "any";

function FilterSelect(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const L = useLocalization();
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Select
        value={props.value === "" ? ANY : props.value}
        onValueChange={(value) => props.onChange(value === ANY ? "" : value)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{L("App::All")}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** L2 参考实现：ABP 装配层之下的通用表，裸 orval hook + `useDataTableState`/`useDataTable`
 * 状态机 + 受控 `DataTable`，工具栏、筛选、视图设置、排序、多选全部显式接线。
 * 非 ABP 数据源的表照此写：筛选外壳来自 data-table 块，值怎么存、怎么拼进请求由页面决定——
 * 这里刻意用两个 `useState` 而不是表单库，说明外壳不绑定任何表单方案。 */
export function BooksL2Demo() {
  const L = useLocalization();
  const state = useDataTableState();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);

  const params: GetApiAppBookParams = {
    ...toAbpListParams(state.params),
    // 这个端点没有通用 Filter 参数，搜索框的关键字落到 Name 上。
    Name: state.params.filter || undefined,
    Type: applied.type === "" ? undefined : (Number(applied.type) as GetApiAppBookParams["Type"]),
    InStock: applied.inStock === "" ? undefined : applied.inStock === "true",
  };
  const listQuery = useGetApiAppBook(params, { query: { placeholderData: keepPreviousData } });
  const items = listQuery.data?.items ?? [];
  const totalCount = listQuery.data?.totalCount ?? 0;

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

  const dt = useDataTable({
    state,
    columns,
    data: items,
    selectable: true,
    pageCount: Math.max(Math.ceil(totalCount / state.pagination.pageSize), 1),
    rowCount: totalCount,
  });

  const apply = (next: Filters) => {
    setDraft(next);
    setApplied(next);
    state.resetPaging();
  };

  const typeOptions = BOOK_TYPE_VALUES.map((value) => ({
    value: String(value),
    label: L(bookTypeLabelKey(value)),
  }));
  const stockOptions = [
    { value: "true", label: L("App::BookOnSale") },
    { value: "false", label: L("App::BookOffSale") },
  ];
  const chips: DataTableFilterChip[] = [
    ...(applied.type !== ""
      ? [
          {
            key: "type",
            label: L("App::BookType"),
            value: L(bookTypeLabelKey(Number(applied.type))),
            onRemove: () => apply({ ...applied, type: "" }),
          },
        ]
      : []),
    ...(applied.inStock !== ""
      ? [
          {
            key: "inStock",
            label: L("App::BookInStock"),
            value: L(applied.inStock === "true" ? "App::BookOnSale" : "App::BookOffSale"),
            onRemove: () => apply({ ...applied, inStock: "" }),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      table={dt}
      loading={listQuery.isPending}
      fetching={listQuery.isFetching && !listQuery.isPending}
    >
      <DataTableToolbar
        table={dt}
        searchPlaceholder={L("App::BookName")}
        bulk={
          <dt.SelectedCount>
            {(count) => (
              <div className="flex items-center gap-3 text-sm">
                {L("Table:NSelected", count)}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={dt.clearSelection}
                >
                  {L("Table:ClearSelection")}
                </Button>
              </div>
            )}
          </dt.SelectedCount>
        }
        onRefresh={() => void listQuery.refetch()}
        refreshing={listQuery.isFetching}
        attention={chips.length > 0}
        utilityLeading={
          <DataTableFilterToggle
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            panelId={panelId}
            activeCount={chips.length}
          />
        }
      >
        <DataTableSortMenu table={dt} />
        <DataTableViewMenu table={dt} />
      </DataTableToolbar>
      {!expanded && <DataTableFilterChips chips={chips} onClearAll={() => apply(NO_FILTERS)} />}
      {expanded && (
        <DataTableFilterPanel
          panelId={panelId}
          onSubmit={() => apply(draft)}
          onReset={() => apply(NO_FILTERS)}
        >
          <FilterSelect
            label={L("App::BookType")}
            value={draft.type}
            options={typeOptions}
            onChange={(type) => setDraft({ ...draft, type })}
          />
          <FilterSelect
            label={L("App::BookInStock")}
            value={draft.inStock}
            options={stockOptions}
            onChange={(inStock) => setDraft({ ...draft, inStock })}
          />
        </DataTableFilterPanel>
      )}
    </DataTable>
  );
}
