// @vitest-environment jsdom
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { AbpQueryPanelToggle, AbpQueryPanelView } from "@/components/abp/table/abp-query-form";
import { QueryDateRange } from "@/components/abp/table/query-date-range";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { Label } from "@/components/ui/label";
import { admin, renderWithProviders } from "./test-utils";

// 组件树需要 t.QueryForm 渲染的真实按钮文案（Query/Reset/Expand/Collapse），故用
// tableMessages，不再像旧版那样单独维护一份只给「手动按钮」用的最小 messages。
const messages = { en: tableMessages.en, "zh-Hans": tableMessages["zh-Hans"] };

// QueryDateRange 用例额外需要 DatePicker 的占位/区间文案（懒加载的 DateRangePicker 内部用）。
const rangeMessages = {
  en: { "": { ...tableMessages.en[""], ...datePickerMessages.en[""] } },
  "zh-Hans": { "": { ...tableMessages["zh-Hans"][""], ...datePickerMessages["zh-Hans"][""] } },
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** 查询字段与「查询/重置」按钮住在默认收起的筛选面板里，顶部条右区的筛选钮点开它，
 * 字段才挂载。用 findBy 等一等：Provider 就绪前首帧是空的，同步 getBy 会扑空。 */
async function openFilters() {
  fireEvent.click(await screen.findByRole("button", { name: "Filters" }));
}

interface Book {
  id: string;
  name: string;
}

/** 端点自有参数（Name/MinPublishDate/MaxPublishDate）+ ABP 分页协议 4 字段，
 * 形状照抄 GetApiAppBookParams（外加一个 MaxPublishDate 给 QueryDateRange 用）。 */
interface BookParams {
  Name?: string;
  MinPublishDate?: string;
  MaxPublishDate?: string;
  Sorting?: string;
  SkipCount?: number;
  MaxResultCount?: number;
}

const page = { items: [{ id: "1", name: "DDD" }], totalCount: 1 };

/** 每个用例独立的假 book service：各自的 listKey 与 spy 互不干扰，spy 直接接住 useList 的入参。 */
function makeBookService(
  listKey: string,
  list: ReturnType<typeof vi.fn<(p: BookParams) => unknown>>,
) {
  return createCrudService<Book, { name: string }, { name: string }>({
    useList: (params: BookParams, options) =>
      useQuery({ queryKey: [listKey, params], queryFn: () => list(params), ...options?.query }),
    useCreate: (options) =>
      useMutation({
        mutationFn: () => Promise.resolve({ id: "2", name: "n" }),
        ...options?.mutation,
      }),
    useUpdate: (options) =>
      useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
    useDelete: (options) =>
      useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
    listKey: () => [listKey],
    supportsFilter: false,
  });
}

const submitList = vi.fn(async (_params: BookParams) => page);
const submitService = makeBookService("query-form-submit", submitList);

const emptyList = vi.fn(async (_params: BookParams) => page);
const emptyService = makeBookService("query-form-empty", emptyList);

const resetList = vi.fn(async (_params: BookParams) => page);
const resetService = makeBookService("query-form-reset", resetList);

const pagingList = vi.fn(async (_params: BookParams) => ({ ...page, totalCount: 30 }));
const pagingService = makeBookService("query-form-paging", pagingList);

const rangeList = vi.fn(async (_params: BookParams) => page);
const rangeService = makeBookService("query-form-range", rangeList);

const crossFieldList = vi.fn(async (_params: BookParams) => page);
const crossFieldService = makeBookService("query-form-cross-field", crossFieldList);

/** `Tags` 之外照抄 `BookParams`，加一个数组值字段给 `MultiComboboxField` 用。 */
interface TaggedBookParams {
  Name?: string;
  Tags?: string[];
  Sorting?: string;
  SkipCount?: number;
  MaxResultCount?: number;
}

const taggedList = vi.fn(async (_params: TaggedBookParams) => page);
const taggedService = createCrudService<Book, { name: string }, { name: string }>({
  useList: (params: TaggedBookParams, options) =>
    useQuery({
      queryKey: ["query-form-tagged", params],
      queryFn: () => taggedList(params),
      ...options?.query,
    }),
  useCreate: (options) =>
    useMutation({
      mutationFn: () => Promise.resolve({ id: "2", name: "n" }),
      ...options?.mutation,
    }),
  useUpdate: (options) =>
    useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
  useDelete: (options) =>
    useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
  listKey: () => ["query-form-tagged"],
  supportsFilter: false,
});

const bookColumns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Name" }];

describe("useAbpTable query form", () => {
  // 「keeps the field component identity stable across re-renders」已随旧 t.QueryField 组件
  // 一起作废：新 API 直接用 t.queryForm.AppField（TanStack Form 生成的字段组件），其渲染身份
  // 稳定性是第三方库自身的职责，不是 useAbpTable 要单独测的东西（CLAUDE.md「不该测：第三方
  // 原语内部」）。

  it("sends the submitted field value as an endpoint param", async () => {
    function Harness() {
      const t = useAbpTable(submitService, {
        columns: bookColumns,
        query: { defaults: { Name: "" } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Name">
              {(f) => <f.TextField label="Name" />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    const input = await screen.findByLabelText("Name");
    // 先让首帧那次未筛选请求解析完，避免它的状态更新落在下面 fireEvent 之外触发 act() 警告。
    await vi.waitFor(() => expect(submitList).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: "DDD" } });
    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => {
      expect(submitList).toHaveBeenCalledWith(expect.objectContaining({ Name: "DDD" }));
    });
  });

  it("prunes an empty field value instead of sending it as an empty string", async () => {
    function Harness() {
      const t = useAbpTable(emptyService, {
        columns: bookColumns,
        query: { defaults: { Name: "" } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Name">
              {(f) => <f.TextField label="Name" />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    const input = await screen.findByLabelText("Name");
    await vi.waitFor(() => expect(emptyList).toHaveBeenCalledTimes(1));

    // 先填并提交出一次真实带值的请求，再清空重新提交，制造「字段曾经有值、现在留白」的
    // 真实场景（而非「从未碰过」的空场景，那种场景下 react-query 会因参数与首帧完全一致而
    // 跳过重新请求，观察不到裁剪是否发生）。
    fireEvent.change(input, { target: { value: "DDD" } });
    fireEvent.click(screen.getByRole("button", { name: "Query" }));
    await vi.waitFor(() => {
      expect(emptyList).toHaveBeenCalledWith(expect.objectContaining({ Name: "DDD" }));
    });

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => expect(emptyList).toHaveBeenCalledTimes(3));
    const lastCall = emptyList.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(Object.keys(lastCall as BookParams)).not.toContain("Name");
  });

  it("resets to query.defaults and re-applies immediately", async () => {
    function Harness() {
      const t = useAbpTable(resetService, {
        columns: bookColumns,
        query: { defaults: { Name: "Alpha" } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Name">
              {(f) => <f.TextField label="Name" />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    const input = (await screen.findByLabelText("Name")) as HTMLInputElement;
    await vi.waitFor(() => expect(resetList).toHaveBeenCalledTimes(1));
    expect(input.value).toBe("Alpha");
    // query.defaults 必须已经在首帧那次请求里生效，不是等字段渲染出来、值回显对了就够，
    // 请求参数本身才是这条路径唯一要保证的东西。
    expect(resetList).toHaveBeenNthCalledWith(1, expect.objectContaining({ Name: "Alpha" }));

    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Query" }));
    await vi.waitFor(() => {
      expect(resetList).toHaveBeenCalledWith(expect.objectContaining({ Name: "Beta" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    // 字段值回到 query.defaults，不是清空成 ""
    await vi.waitFor(() => expect(input.value).toBe("Alpha"));
    // 且立即重新生效：紧跟着的请求已经带回 query.defaults 的值，不必用户再点一次查询
    await vi.waitFor(() => {
      expect(resetList).toHaveBeenLastCalledWith(expect.objectContaining({ Name: "Alpha" }));
    });
  });

  it("resets paging to page 1 on submit", async () => {
    function Harness() {
      const t = useAbpTable(pagingService, {
        columns: bookColumns,
        query: { defaults: { Name: "" } },
        defaultPageSize: 10,
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Name">
              {(f) => <f.TextField label="Name" />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    const input = await screen.findByLabelText("Name");
    await vi.waitFor(() => expect(pagingList).toHaveBeenCalledTimes(1));
    // 分页器的可用性（canNext）要等第一页数据真正渲染出来后才算数，只等 mock 被调用不够，
    // 请求还没 resolve 时表格仍在骨架态，"下一页"链接尚未按真实 pageCount 决定可点性。
    await screen.findByText("DDD");

    // 页脚为响应式布局渲染了两份分页器（移动端/桌面端），二者在无障碍树里都在场，点第一个即可。
    fireEvent.click(screen.getAllByRole("link", { name: /next/i })[0]);
    await vi.waitFor(() => {
      expect(pagingList).toHaveBeenCalledWith(expect.objectContaining({ SkipCount: 10 }));
    });

    fireEvent.change(input, { target: { value: "DDD" } });
    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => {
      expect(pagingList).toHaveBeenLastCalledWith(
        expect.objectContaining({ Name: "DDD", SkipCount: 0 }),
      );
    });
  });

  it("submits both ends of a QueryDateRange selection as separate params", async () => {
    const user = userEvent.setup();
    function Harness() {
      const t = useAbpTable(rangeService, {
        columns: bookColumns,
        query: { defaults: { MinPublishDate: "", MaxPublishDate: "" } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <QueryDateRange
              form={t.queryForm}
              from="MinPublishDate"
              to="MaxPublishDate"
              label="Published"
            />
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages: rangeMessages, identity: admin });
    await openFilters();
    await vi.waitFor(() => expect(rangeList).toHaveBeenCalledTimes(1));

    // 触发器的可访问名来自关联的 FieldLabel（"Published"），`<label for>` 关联在无障碍名
    // 计算里优先于控件自身的占位文案。懒加载的 DateRangePicker 需要更宽的超时（照抄
    // date-fields.test.tsx 里同样懒加载字段的 timeout: 5000 约定）。
    await user.click(await screen.findByRole("button", { name: "Published" }, { timeout: 5000 }));
    // numberOfMonths=2 时两个月历并排渲染，同一天数在两个月各出现一次；取第一个匹配即为
    // 当前月的那天（照抄 date-range-picker.test.tsx 的点选方式）。
    // 页脚的「每页行数」<Select> 隐藏值 span 也以文本 "10" 存在于 DOM 里，且排在日历天数按钮
    // 之前，过滤到真正的日历天数按钮（rdp day button）上再取第一个匹配（当前月）。
    const dayButton = (day: string) =>
      screen.getAllByText(day).find((el): el is HTMLButtonElement => el.tagName === "BUTTON");
    await user.click(dayButton("10") as HTMLButtonElement);
    await user.click(dayButton("20") as HTMLButtonElement);
    await user.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => {
      const lastCall = rangeList.mock.calls.at(-1)?.[0];
      expect(lastCall).toEqual(
        expect.objectContaining({
          MinPublishDate: expect.stringMatching(/^\d{4}-\d{2}-10$/),
          MaxPublishDate: expect.stringMatching(/^\d{4}-\d{2}-20$/),
        }),
      );
    });
  });

  it("warns in DEV when a cross-field zod issue has no path to render on", async () => {
    // 没挂 path 的 .refine：校验失败时错误只会落在 errorMap.onDynamic 的 "" 桶，现有
    // FormErrors（只订阅 onSubmit）渲染不出来，这条路径必须在 DEV 期喊出来，否则就是
    // "配置了校验、点击提交、界面毫无反应、请求也没发出去"的静默失效。
    const schema = z
      .object({ Name: z.string().optional() })
      .refine(() => false, { message: "CROSS_FIELD_INVALID" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Harness() {
      const t = useAbpTable(crossFieldService, {
        columns: bookColumns,
        query: { defaults: { Name: "" }, validators: { onDynamic: schema } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Name">
              {(f) => <f.TextField label="Name" />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    await screen.findByLabelText("Name");
    await vi.waitFor(() => expect(crossFieldList).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => {
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes("跨字段校验错误"));
      expect(hits).toHaveLength(1);
    });
    // 校验失败：提交被拦下，请求没有因为这次点击而多发一次
    expect(crossFieldList).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it("renders and submits a children-escape-hatch array field whose query.defaults declares the initial value", async () => {
    // MultiComboboxField 走 useFieldContext<string[]>()，字段级 defaultValue 不声明时会退化成
    // ""，values.map 直接崩溃。query.defaults 给这个字段一个数组初值就绕开了这条退化路径，
    // 新 API 下这是唯一的初值来源（旧 QueryField 的 emptyValue 逃生舱已随之删除）。
    function Harness() {
      const t = useAbpTable(taggedService, {
        columns: bookColumns,
        query: { defaults: { Tags: ["fiction"] } },
      });
      return (
        <t.Table>
          <t.QueryForm>
            <t.queryForm.AppField name="Tags">
              {(f) => <f.MultiComboboxField label="Tags" options={[]} editable={false} />}
            </t.queryForm.AppField>
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages, identity: admin });
    await openFilters();
    expect(await screen.findByText("fiction")).toBeTruthy();
    await vi.waitFor(() => expect(taggedList).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    await vi.waitFor(() => {
      expect(taggedList).toHaveBeenCalledWith(expect.objectContaining({ Tags: ["fiction"] }));
    });
  });

  // 「renders and submits a children-escape-hatch array field via emptyValue with no
  // queryDefaults entry」已删除：它测的是旧 `t.QueryField` 的 `emptyValue` 逃生舱，未在
  // queryDefaults 声明初值时单独给某个字段一个初值。新 API 没有这个逃生舱，`query.defaults`
  // 是唯一的初值来源，字段必须在那里声明（上一条用例即证明）。
  //
  // 这条用例的反面（「引用一个没在 query.defaults 声明的字段名，编译期必须报错」）已改写成
  // `query-form-contract.test-d.ts` 里的 `@ts-expect-error` 探针（编译期关注点，
  // 不属于本文件的运行时断言）。
});

// 「AbpTable default query wiring」旧描述块（对着 `<AbpTable {...t} query={<t.QueryField/>}>`
// 断言内建 Query/Reset 按钮默认接线）已删除：新 API 下 `t.QueryForm` 内建按钮的 onSubmit/
// onReset 本就无条件接到 submitQuery/resetQuery，没有"手动覆盖"这个分叉可测，上面迁移后的
// "sends the submitted field value..." 与 "resets to query.defaults..." 两条用例已经在通过
// t.QueryForm 真实渲染的 Query/Reset 按钮点击断言同一件事，是这两条旧用例的等价覆盖。

function shellField(label: string) {
  return (
    <div key={label} className="grid gap-2">
      <Label htmlFor={label}>{label}</Label>
      <input id={label} />
    </div>
  );
}

/** 静态 fake source：只为渲染筛选面板的外壳（开合、空态守卫、aria-controls），
 * 不需要真实取数,故不用 createCrudService + react-query。 */
const makeStaticSource =
  (): ((p: Record<string, unknown>) => AbpTableSource<Book>) => (_params) => ({
    listQuery: {
      data: { items: [], totalCount: 0 },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount: 1,
    totalCount: 0,
    can: { create: false, update: false, delete: false },
    supportsFilter: true,
  });

/** 同上，但带一行在场数据：勾选行才有得选，用于验证批量态下的顶部条行为。 */
const makeSelectableSource =
  (): ((p: Record<string, unknown>) => AbpTableSource<Book>) => (_params) => ({
    listQuery: {
      data: { items: [{ id: "1", name: "DDD" }], totalCount: 1 },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount: 1,
    totalCount: 1,
    can: { create: false, update: false, delete: false },
    supportsFilter: true,
  });

describe("t.QueryForm shell", () => {
  // 高级筛选整体住在默认收起的面板里，由顶部条右区的筛选钮开合；t.QueryForm 是标记组件，
  // 必须在 t.Table 里测。脱离 t.Table 单独渲染它只会得到 null。
  it("keeps every query field unmounted until the filter panel is opened", async () => {
    function Harness() {
      const t = useAbpTable(makeStaticSource(), { columns: bookColumns });
      return (
        <t.Table>
          <t.QueryForm>
            {shellField("Field 0")}
            {shellField("Field 1")}
          </t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages });
    await screen.findByRole("button", { name: "Filters" });

    // 收起态：字段与查询/重置按钮都不在 DOM 里
    expect(screen.queryByLabelText("Field 0")).toBeNull();
    expect(screen.queryByRole("button", { name: "Query" })).toBeNull();

    await openFilters();

    expect(screen.getByLabelText("Field 0")).not.toBeNull();
    expect(screen.getByLabelText("Field 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Query" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).not.toBeNull();
  });

  it("gives the search box back when the panel closes", async () => {
    function Harness() {
      const t = useAbpTable(makeStaticSource(), { columns: bookColumns });
      return (
        <t.Table>
          <t.QueryForm>{shellField("Field 0")}</t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages });
    // 默认：搜索框在场、面板关着
    expect(await screen.findByPlaceholderText("Search…")).not.toBeNull();

    await openFilters();
    // 展开：面板里是更精确的字段筛选，模糊搜索框让位
    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
    expect(screen.getByLabelText("Field 0")).not.toBeNull();

    await openFilters();
    expect(screen.getByPlaceholderText("Search…")).not.toBeNull();
    expect(screen.queryByLabelText("Field 0")).toBeNull();
  });

  it("keeps the panel toggle usable while rows are selected", async () => {
    // 筛选钮住在右区功能组，不随左区切到批量态而消失，否则面板开着时勾选一行就再也收不回来。
    function Harness() {
      const t = useAbpTable(makeSelectableSource(), { columns: bookColumns, selectable: true });
      return (
        <t.Table>
          <t.QueryForm>{shellField("Field 0")}</t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages });
    await screen.findByText("DDD");

    await openFilters();
    expect(screen.getByLabelText("Field 0")).not.toBeNull();

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    await screen.findByRole("button", { name: "Clear" });

    await openFilters();
    expect(screen.queryByLabelText("Field 0")).toBeNull();
  });

  it("offers no filter toggle when no query fields are declared", async () => {
    function Harness() {
      const t = useAbpTable(makeStaticSource(), { columns: bookColumns });
      return (
        <t.Table>
          <t.QueryForm>{null}</t.QueryForm>
        </t.Table>
      );
    }

    renderWithProviders(<Harness />, { messages });
    expect(await screen.findByPlaceholderText("Search…")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
  });
});

describe("query panel views", () => {
  it("submits on Enter inside a panel field without a native form", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <AbpQueryPanelView
        fields={[shellField("Field 0")]}
        onSubmit={onSubmit}
        onReset={vi.fn()}
        panelId="qp"
      />,
      { messages },
    );
    fireEvent.keyDown(await screen.findByLabelText("Field 0"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // 面板 Query/Reset 按钮的接线由本文件更上层的 "sends the submitted field value as an endpoint
  // param" 与 "resets to query.defaults and re-applies immediately" 覆盖，那两条点的就是
  // t.QueryForm 渲染出来的同一对按钮，并一路断言到端点参数，比在这里断言 onSubmit 被调过更强。
  it("wires the toggle with aria-expanded/aria-controls and fires onToggle", async () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <AbpQueryPanelToggle
        expanded={false}
        onToggle={onToggle}
        panelId="panel-x"
        activeCount={0}
      />,
      { messages },
    );
    const toggle = await screen.findByRole("button", { name: "Filters" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // 收起时面板已从 DOM 卸载，aria-controls 不挂悬空引用。
    expect(toggle.getAttribute("aria-controls")).toBeNull();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("points aria-controls at the panel id while expanded", async () => {
    renderWithProviders(
      <AbpQueryPanelToggle expanded={true} onToggle={vi.fn()} panelId="panel-x" activeCount={0} />,
      { messages },
    );
    const toggle = await screen.findByRole("button", { name: "Filters" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("panel-x");
  });

  it("announces how many filters are applied while the panel is closed", async () => {
    // 面板一收，界面上唯一的"还筛着"信号是那个圆点，它是纯视觉的，读屏得有等价文本。
    renderWithProviders(
      <AbpQueryPanelToggle expanded={false} onToggle={vi.fn()} panelId="panel-x" activeCount={2} />,
      { messages },
    );
    expect(await screen.findByText("2 filters applied")).not.toBeNull();
  });

  it("renders panel fields under the given panel id", async () => {
    renderWithProviders(
      <AbpQueryPanelView
        fields={[shellField("Field 9")]}
        onSubmit={vi.fn()}
        onReset={vi.fn()}
        panelId="panel-y"
      />,
      { messages },
    );
    expect(await screen.findByLabelText("Field 9")).toBeDefined();
    expect(document.getElementById("panel-y")).not.toBeNull();
  });
});
