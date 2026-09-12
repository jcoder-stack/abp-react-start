import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { type Status, StatusBadge } from "@/components/abp/table/status-badge";
import { createTableColumnHelper, type TableColumnDef } from "@/components/data-table/table-core";

/** 列标签：词条 key，或自渲染函数。给 key 时 `L()` 在渲染期由标签组件内部调用，列定义因此
 *  不依赖 `L`，可以降成模块级常量——`useDataTable` 对 columns 的引用稳定性要求随之自动满足。
 *  计算型表头（拼接、带图标等）走函数形态。 */
export type ColumnLabel = string | (() => ReactNode);

/** 预设列的可覆盖面。预设产出的是普通 `ColumnDef`，这里的键整键覆盖预设的默认值，
 *  包括 `cell`/`header`/`meta`——预设是加法糖，任何时候都能退回 TanStack 原生写法。 */
type ColumnOverrides<TData extends RowData> = Partial<TableColumnDef<TData>>;

/** `TData` 上值类型可赋给 `TValue` 的字段名。DTO 字段普遍可选，故按 `NonNullable` 判定。 */
type FieldsOf<TData, TValue> = {
  [K in Extract<keyof TData, string>]-?: NonNullable<TData[K]> extends TValue ? K : never;
}[Extract<keyof TData, string>];

function LocalizedText(props: { entry: string }) {
  const L = useLocalization();
  return <>{L(props.entry)}</>;
}

function BoolCell(props: { value: boolean | undefined; status: Status | undefined }) {
  const L = useLocalization();
  const text = L(props.value ? "Table:Yes" : "Table:No");
  if (props.status === undefined) {
    return <span className={props.value ? undefined : "text-muted-foreground"}>{text}</span>;
  }
  return <StatusBadge status={props.status}>{text}</StatusBadge>;
}

/** 把列标签转成 `ColumnDef["header"]` 渲染器。预设内部用它；手写 `accessor`/`display` 列时
 *  也该用它而不是直接调 `L()`——那会把列定义重新绑回 hook，失去模块级常量的资格。 */
export function columnHeader(label: ColumnLabel): () => ReactNode {
  return typeof label === "string" ? () => <LocalizedText entry={label} /> : label;
}

/** ABP 的 date-only 字段回来的是完整 ISO datetime，表格里只展示日期段。
 *  刻意不做时区换算：值本身就没有时刻语义，换算只会把日期挪错一天。 */
function dateOnly(value: string | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * 列构造器：v9 原生的 `accessor`/`display`/`group` 原样透出，另加五个 ABP 后台常见列型的预设。
 *
 * 预设省掉的是重复的 cell 渲染与对齐，不是表达力：每个预设都接 `opts` 整键覆盖，
 * 覆盖不了的场景直接用 `accessor`/`display` 手写。
 *
 * @example
 * ```tsx
 * const col = createAbpColumns<BookDto>();
 * const columns = [
 *   col.text("name", "App::BookName"),
 *   col.money("price", "App::BookPrice", { digits: 2 }),
 *   col.enum("type", "App::BookType", { map: BOOK_TYPE_KEYS, enableSorting: false }),
 * ];
 * ```
 */
export function createAbpColumns<TData extends RowData>() {
  const helper = createTableColumnHelper<TData>();

  const text = (
    key: FieldsOf<TData, string>,
    label: ColumnLabel,
    opts?: ColumnOverrides<TData>,
  ): TableColumnDef<TData> => ({
    accessorKey: key,
    header: columnHeader(label),
    ...opts,
  });

  const date = (
    key: FieldsOf<TData, string>,
    label: ColumnLabel,
    opts?: ColumnOverrides<TData>,
  ): TableColumnDef<TData> => ({
    accessorKey: key,
    header: columnHeader(label),
    cell: ({ row }) => dateOnly(row.original[key] as string | undefined),
    ...opts,
  });

  const money = (
    key: FieldsOf<TData, number>,
    label: ColumnLabel,
    opts?: { digits?: number } & ColumnOverrides<TData>,
  ): TableColumnDef<TData> => {
    const { digits = 2, ...overrides } = opts ?? {};
    return {
      accessorKey: key,
      header: columnHeader(label),
      meta: { align: "right" },
      cell: ({ row }) => {
        const value = row.original[key] as number | undefined;
        return typeof value === "number" ? value.toFixed(digits) : "";
      },
      ...overrides,
    };
  };

  const enumColumn = (
    key: FieldsOf<TData, number | string>,
    label: ColumnLabel,
    opts: {
      /** 值 → 词条 key。查不到的值按原样渲染，不吞掉。 */
      map: Record<string | number, string>;
      /** 值为空时用的词条 key；省略则渲染空串。 */
      fallback?: string;
    } & ColumnOverrides<TData>,
  ): TableColumnDef<TData> => {
    const { map, fallback, ...overrides } = opts;
    return {
      accessorKey: key,
      header: columnHeader(label),
      cell: ({ row }) => {
        const value = row.original[key] as string | number | undefined;
        if (value === undefined || value === null) {
          return fallback ? <LocalizedText entry={fallback} /> : "";
        }
        const entry = map[value];
        return entry ? <LocalizedText entry={entry} /> : String(value);
      },
      ...overrides,
    };
  };

  const bool = (
    key: FieldsOf<TData, boolean>,
    label: ColumnLabel,
    opts?: {
      /** 值为真时的徽章语义色。不传就渲染成普通文字（否为 muted）——布尔字段多数是**属性**
       *  （isDefault、isPublic），徽章的含义是「这条记录当前处于某状态」，套在属性上既夸大了它，
       *  又逼着为它挑一个说不出理由的颜色。只有「启用/健康」这类真正的状态才传 `success`。 */
      trueStatus?: Status;
      /** 值为假时的徽章语义色；仅在 `trueStatus` 给出时生效，默认 `neutral`。 */
      falseStatus?: Status;
    } & ColumnOverrides<TData>,
  ): TableColumnDef<TData> => {
    const { trueStatus, falseStatus = "neutral", ...overrides } = opts ?? {};
    return {
      accessorKey: key,
      header: columnHeader(label),
      cell: ({ row }) => {
        const value = row.original[key] as boolean | undefined;
        const status = trueStatus === undefined ? undefined : value ? trueStatus : falseStatus;
        return <BoolCell value={value} status={status} />;
      },
      ...overrides,
    };
  };

  return {
    accessor: helper.accessor,
    display: helper.display,
    group: helper.group,
    text,
    date,
    money,
    enum: enumColumn,
    bool,
  };
}
