import { describe, expect, it } from "vitest";
import {
  bookSchema,
  EMPTY_BOOK_VALUES,
  toBookInput,
  toBookValues,
} from "@/routes/_layout/_authed/books/-book-form";

const L = ((key: string) => key) as Parameters<typeof bookSchema>[0];

const valid = {
  ...EMPTY_BOOK_VALUES,
  name: "Dune",
  authorId: "a1",
  publishDate: "1965-08-01",
  price: 9.5,
};

function issuesOf(value: typeof valid) {
  const result = bookSchema(L).safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join("."), i.message]);
}

describe("book form rules", () => {
  it("requires stock for a book on sale, reported on the stock field", () => {
    expect(issuesOf({ ...valid, inStock: true, stock: null })).toEqual([
      ["stock", "App::BookStockRequired"],
    ]);
    expect(issuesOf({ ...valid, inStock: true, stock: 3 })).toEqual([]);
  });

  it("rejects a promotion that ends before it starts, reported on the promo field", () => {
    expect(issuesOf({ ...valid, promo: { from: "2026-12-10", to: "2026-12-01" } })).toEqual([
      ["promo", "App::BookPromoInvalid"],
    ]);
    expect(issuesOf({ ...valid, promo: { from: "2026-12-01", to: "" } })).toEqual([]);
  });

  it("round-trips the promotion and sends empty optional fields as null", () => {
    const input = toBookInput({ ...valid, promo: { from: "2026-12-01", to: "2026-12-31" } });
    expect(input).toMatchObject({
      promoStartDate: "2026-12-01",
      promoEndDate: "2026-12-31",
      description: null,
      saleStartsAt: null,
    });
    expect(toBookValues({ ...input, id: "b1" }).promo).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});
