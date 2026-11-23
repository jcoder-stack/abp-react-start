import type { AbpTableExportContext } from "@/components/abp/table/use-abp-table";
import { bookGetList } from "@/routes/_layout/_authed/books/-book-api";
import type { BookDto, BookGetListParams } from "@/routes/_layout/_authed/books/-book-models";

const EXPORT_LIMIT = 1000;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * 「导出」图标的实现：有选中行就只导出选中的，否则按当前已提交的查询条件取全部匹配行。
 * 组件库不内置导出——格式、列、上限都是业务决定，这里只示范 `onExport` 上下文怎么用。
 */
export async function exportBooksCsv(
  context: AbpTableExportContext<BookDto>,
  headers: string[],
): Promise<number> {
  const selected = context.getSelectedRows();
  let rows = selected;
  if (rows.length === 0) {
    // 去掉分页参数再发：要的是全部匹配，不是当前这一页。
    const { SkipCount: _skip, MaxResultCount: _max, ...params } = context.getListParams();
    const result = await bookGetList({
      ...(params as BookGetListParams),
      SkipCount: 0,
      MaxResultCount: EXPORT_LIMIT,
    });
    rows = result.items;
  }
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((b) =>
      [b.name, b.authorName, b.publishDate?.slice(0, 10), b.price, b.stock, b.inStock]
        .map(csvCell)
        .join(","),
    ),
  ];
  // BOM 让 Excel 按 UTF-8 打开，中文书名才不会乱码。
  const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "books.csv";
  link.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
