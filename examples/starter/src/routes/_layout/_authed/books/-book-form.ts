import type { Localize } from "@jcoder-stack/abp-react/react";
import { z } from "zod";
import type {
  AbpSwaggerBooksBookDto,
  AbpSwaggerBooksCreateUpdateBookDto,
} from "@/routes/_layout/_authed/books/-book-models";
import {
  postApiAppBookBody,
  postApiAppBookBodyNameMax,
} from "@/routes/_layout/_authed/books/-book-models";

/** ABP demo BookStore 的图书类型枚举（0–8）；文案取自 App:: 词条桶。 */
export const BOOK_TYPE_KEYS: Record<number, string> = {
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
export const BOOK_TYPE_VALUES = Object.keys(BOOK_TYPE_KEYS).map(Number);

export function bookTypeLabelKey(value: number | undefined): string {
  return BOOK_TYPE_KEYS[value ?? 0] ?? "App::BookTypeUndefined";
}

export const BOOK_TAG_KEYS: Record<string, string> = {
  classic: "App::BookTagClassic",
  award: "App::BookTagAward",
  bestseller: "App::BookTagBestseller",
  series: "App::BookTagSeries",
};

export interface BookFormValues {
  name: string;
  authorId: string;
  type: string;
  tags: string[];
  description: string;
  publishDate: string;
  price: number;
  inStock: boolean;
  stock: number | null;
  saleStartsAt: string;
  promo: { from: string; to: string };
}

export const EMPTY_BOOK_VALUES: BookFormValues = {
  name: "",
  authorId: "",
  type: "0",
  tags: [],
  description: "",
  publishDate: "",
  // 不预填 0：它能通过非空校验，那个必填标记就永远不会触发，用户还得先把 0 删掉。
  // NumberField 把空输入映射成 NaN，默认值同样给 NaN，字段才是真的空。
  price: Number.NaN,
  inStock: false,
  stock: null,
  saleStartsAt: "",
  promo: { from: "", to: "" },
};

/** 不能走默认映射：SelectField 是 string 值域（枚举 String/Number 往返），publishDate 要切成
 *  date-only，促销期在 DTO 里是两个扁平字段、表单里是一个区间。 */
export function toBookValues(record: AbpSwaggerBooksBookDto): BookFormValues {
  return {
    name: record.name ?? "",
    authorId: record.authorId ?? "",
    type: String(record.type ?? 0),
    tags: record.tags ?? [],
    description: record.description ?? "",
    publishDate: record.publishDate ? record.publishDate.slice(0, 10) : "",
    price: record.price ?? 0,
    inStock: record.inStock ?? false,
    stock: record.stock ?? null,
    saleStartsAt: record.saleStartsAt ?? "",
    promo: { from: record.promoStartDate ?? "", to: record.promoEndDate ?? "" },
  };
}

/** create/update 共用同一映射。空串一律换成 null：后端区分「没填」和「填了空串」。 */
export function toBookInput(value: BookFormValues): AbpSwaggerBooksCreateUpdateBookDto {
  const { promo, ...rest } = value;
  return {
    ...rest,
    type: Number(value.type) as AbpSwaggerBooksCreateUpdateBookDto["type"],
    description: value.description.trim() || null,
    saleStartsAt: value.saleStartsAt || null,
    promoStartDate: promo.from || null,
    promoEndDate: promo.to || null,
  };
}

/** 以生成的 body schema 为基底：max(128) 这类后端约束免费继承；与表单形状不同的键 omit 后重声明。
 *  `L` 由调用方传入，消息全部走词条。 */
export function bookSchema(L: Localize) {
  return postApiAppBookBody
    .omit({
      type: true,
      stock: true,
      description: true,
      saleStartsAt: true,
      promoStartDate: true,
      promoEndDate: true,
    })
    .extend({
      type: z.string(),
      name: z
        .string()
        .trim()
        .min(1, L("App::BookNameRequired"))
        .max(postApiAppBookBodyNameMax, L("Form:MaxLength", postApiAppBookBodyNameMax)),
      authorId: z.string().min(1, L("App::BookAuthorRequired")),
      tags: z.array(z.string()),
      description: z.string().max(1000, L("Form:MaxLength", 1000)),
      publishDate: z.string().min(1, L("App::BookPublishDateRequired")),
      price: z.number(L("App::BookPriceRequired")).min(0, L("App::BookPriceInvalid")),
      inStock: z.boolean(),
      stock: z
        .number()
        .int(L("App::BookStockInvalid"))
        .min(0, L("App::BookStockInvalid"))
        .nullable(),
      saleStartsAt: z.string(),
      promo: z.object({ from: z.string(), to: z.string() }),
    })
    .superRefine((value, ctx) => {
      // 跨字段规则要落到具体字段上（path），否则错误只能挂在表单顶部，用户不知道该改哪一格。
      if (value.inStock && (value.stock === null || value.stock <= 0)) {
        ctx.addIssue({ code: "custom", path: ["stock"], message: L("App::BookStockRequired") });
      }
      if (value.promo.from !== "" && value.promo.to !== "" && value.promo.to < value.promo.from) {
        ctx.addIssue({ code: "custom", path: ["promo"], message: L("App::BookPromoInvalid") });
      }
    });
}
