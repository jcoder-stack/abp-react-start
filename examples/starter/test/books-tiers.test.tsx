// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import {
  useDeleteApiAppBookId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/routes/_layout/_authed/books/-book-api";
import { Route } from "@/routes/_layout/_authed/books/index";
import { admin, renderWithProviders } from "./test-utils";

// 渲染真实的 books 页面（Route.options.component 就是 index.tsx 的 BooksPage），而不是复刻一份
// 装配壳：books 没有 @/auth 依赖，import 该路由模块在 vitest 下能干净加载（无 server-fn 报错），
// 复刻挂具反而测不出 index.tsx 自己的页签/Sheet 接线是否正确（页签内容装错、Sheet 被嵌进 Tabs
// 这类回归，复刻挂具从不会跑到真实代码，自然抓不到）。
// 端点模块整体 mock 掉：三个页签都靠它取数据，且它内含 createServerFn，本仓 vitest 没装
// TanStack Start 插件，真加载会炸。类型与 body schema 在 -book-models.ts，不受影响照常真用。
// getApiAppAuthor/useGetApiAppAuthorId 一并给桩：前者被 loadAuthorOptions 引用，后者只在
// record 存在时 enabled，三条用例都不进编辑态。
vi.mock("@/routes/_layout/_authed/books/-book-api", () => ({
  useGetApiAppBook: vi.fn(),
  getApiAppAuthor: vi.fn(async () => ({ items: [], totalCount: 0 })),
  useGetApiAppAuthorId: () => ({ data: undefined }),
  useDeleteApiAppBookId: vi.fn(),
  usePostApiAppBook: vi.fn(),
  usePutApiAppBookId: vi.fn(),
  getGetApiAppBookQueryKey: () => ["book"],
}));

// App 词条桶没接进挂具（跟 tenants-field-set.test.tsx 同款注释：L() 缺条目回退成 key 本身），
// 页签/字段标签断言一律用回退后的原始 key 文本，不嵌入手写翻译文案。
const messages = {
  en: { "": { ...tableMessages.en[""], ...formMessages.en[""], ...crudMessages.en[""] } },
  "zh-Hans": {
    "": {
      ...tableMessages["zh-Hans"][""],
      ...formMessages["zh-Hans"][""],
      ...crudMessages["zh-Hans"][""],
    },
  },
};

const BOOKS = [
  { id: "1", name: "Book One", authorName: "Author A", price: 9.99, publishDate: "2020-01-01" },
  { id: "2", name: "Book Two", authorName: "Author B", price: 19.99, publishDate: "2021-02-02" },
];

type GetQuery = ReturnType<typeof useGetApiAppBook>;
type DeleteMutation = ReturnType<typeof useDeleteApiAppBookId>;
type PostMutation = ReturnType<typeof usePostApiAppBook>;
type PutMutation = ReturnType<typeof usePutApiAppBookId>;

const mockUseGetApiAppBook = vi.mocked(useGetApiAppBook);
const mockUseDeleteApiAppBookId = vi.mocked(useDeleteApiAppBookId);
const mockUsePostApiAppBook = vi.mocked(usePostApiAppBook);
const mockUsePutApiAppBookId = vi.mocked(usePutApiAppBookId);

/** Route.options.component 就是 index.tsx 里的 BooksPage，file-route 内部函数本身没有具名导出，
 * 但组装它的 route 对象是导出的，借道拿到真实页面组件，不必另开一份复刻。 */
function renderBooksPage() {
  const BooksPage = Route.options.component;
  if (!BooksPage) throw new Error("books route has no component");
  return renderWithProviders(<BooksPage />, { identity: admin, messages });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGetApiAppBook.mockReturnValue({
    data: { items: BOOKS, totalCount: BOOKS.length },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as GetQuery);
  mockUseDeleteApiAppBookId.mockReturnValue({ mutate: vi.fn() } as unknown as DeleteMutation);
  mockUsePostApiAppBook.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  } as unknown as PostMutation);
  mockUsePutApiAppBookId.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  } as unknown as PutMutation);
});

describe("books page: one page, three tiers", () => {
  it("default tab renders the standard table (regression guard)", async () => {
    renderBooksPage();

    await screen.findByText("Book One");
    expect(screen.getByRole("button", { name: /create/i })).toBeDefined();
  });

  it("L1 tab shows rows with no create button and no search box (can.create:false, supportsFilter:false)", async () => {
    renderBooksPage();
    await screen.findByText("Book One");

    // Radix TabsTrigger 只在 onMouseDown 上切换（onClick 不生效），跟 crud-flow.test.tsx 里
    // DropdownMenuTrigger 用 pointerDown 是同类坑
    fireEvent.mouseDown(screen.getByRole("tab", { name: "App::BooksTierL1" }));

    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("L2 tab shows rows with no actions column", async () => {
    renderBooksPage();
    await screen.findByText("Book One");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "App::BooksTierL2" }));

    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  });

  it("keeps the create sheet open across tab switches (page.Sheet lives outside Tabs)", async () => {
    renderBooksPage();
    await screen.findByText("Book One");

    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await screen.findByRole("dialog");

    // Sheet 是模态 Dialog：打开时 Radix 把背景内容标成 aria-hidden，getByRole 默认排除它，
    // 这里只关心「Tabs 是否仍挂在原地」这一结构性事实，用 hidden:true 绕过可达性过滤直接查到
    // 背景里的页签触发器。切换方式故意用 keyDown 而非 mouseDown/click，TabsTrigger 的选中态
    // 在两者上都会触发，但 mouseDown 会一并撞上 Dialog 全局的「pointerdown outside 即关闭」
    // 监听，把 Sheet 关掉，掩盖了真正要测的「TabsContent 卸载与否」这条结构性事实。
    fireEvent.keyDown(screen.getByRole("tab", { name: "App::BooksTierL1", hidden: true }), {
      key: "Enter",
    });

    // Sheet 若被嵌进 Tabs，切页签会把它跟 standard 的 TabsContent 一起卸载、Dialog 随之消失；
    // 留在 Tabs 外层才能在切页签后依然挂在原地。
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});
