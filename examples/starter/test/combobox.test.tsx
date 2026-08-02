// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox } from "@/components/combobox/combobox";
import comboboxMessages from "@/components/combobox/combobox-messages.json";
import { MultiCombobox } from "@/components/combobox/multi-combobox";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";
import { renderWithProviders } from "./test-utils";

const FRUIT_OPTIONS: ComboboxOption[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

function SingleHarness({
  initial,
  ...rest
}: { initial?: string } & Partial<Parameters<typeof Combobox>[0]>) {
  const [value, setValue] = useState<string | undefined>(initial);
  return <Combobox value={value} onChange={setValue} options={FRUIT_OPTIONS} {...rest} />;
}

function MultiHarness({
  initial,
  ...rest
}: { initial?: string[] } & Partial<Parameters<typeof MultiCombobox>[0]>) {
  const [values, setValues] = useState<string[]>(initial ?? []);
  return <MultiCombobox values={values} onChange={setValues} options={FRUIT_OPTIONS} {...rest} />;
}

// combobox 的 popup 只在打开时才挂载到 DOM（关闭态整棵子树都不渲染，不是 CSS 隐藏）。
// @base-ui 的 ComboboxInput 在 onChange 里靠 `event.nativeEvent.inputType` 判定"是不是浏览器
// autofill 那种要压制的输入"，只有非 autofill-like 才 setOpen(true)；jsdom 合成事件默认没有
// inputType（undefined 会被当成 autofill-like 而不开），显式传 inputType: "insertText" 复刻
// 真实键入。先填一个字符再清空，既能确定性打开列表，又能回到空搜索词看全量选项。
function openCombobox(input: HTMLInputElement) {
  // fireEvent.change dispatches a plain `Event`（inputType 不是识别成员，会被 Event 构造器丢弃）；
  // fireEvent.input 走 InputEvent 构造器，inputType 才能真的落到 event.nativeEvent 上。
  fireEvent.input(input, { target: { value: "a" }, inputType: "insertText" });
  fireEvent.input(input, { target: { value: "" }, inputType: "deleteContentBackward" });
}

// 每个用例都不应该把 fake timers 泄漏给下一个用例（否则 waitFor/findBy 的真实轮询会直接超时）。
afterEach(() => {
  vi.useRealTimers();
});

describe("Combobox (static, single select)", () => {
  it("opens the list and shows all options on click", async () => {
    renderWithProviders(<SingleHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    expect(await screen.findByText("Apple")).toBeDefined();
    expect(screen.getByText("Banana")).toBeDefined();
    expect(screen.getByText("Cherry")).toBeDefined();
  });

  it("filters options locally as the user types (case-insensitive)", async () => {
    renderWithProviders(<SingleHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    await screen.findByText("Apple");
    fireEvent.change(input, { target: { value: "AN" } });
    await waitFor(() => expect(screen.queryByText("Apple")).toBeNull());
    expect(screen.getByText("Banana")).toBeDefined();
    expect(screen.queryByText("Cherry")).toBeNull();
  });

  it("calls onChange with the selected value", async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState<string | undefined>(undefined);
      return (
        <Combobox
          value={value}
          onChange={(v) => {
            onChange(v);
            setValue(v);
          }}
          options={FRUIT_OPTIONS}
        />
      );
    }
    renderWithProviders(<Controlled />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    fireEvent.click(await screen.findByText("Banana"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("banana"));
  });

  it("shows the empty-state entry when no options match", async () => {
    renderWithProviders(<SingleHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    await screen.findByText("Apple");
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(await screen.findByText("No results found")).toBeDefined();
  });
});

describe("Combobox (remote loadOptions)", () => {
  it("debounces loadOptions by 400ms, shows a loading entry, then renders results", async () => {
    let resolveLoad: (options: ComboboxOption[]) => void = () => {};
    const loadOptions = vi.fn(
      () =>
        new Promise<ComboboxOption[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderWithProviders(<SingleHarness options={undefined} loadOptions={loadOptions} />, {
      messages: comboboxMessages,
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;

    vi.useFakeTimers();
    openCombobox(input);

    expect(loadOptions).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(loadOptions).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadOptions).toHaveBeenCalledTimes(1);
    expect(loadOptions).toHaveBeenCalledWith("");
    expect(screen.getByText("Loading…")).toBeDefined();

    resolveLoad(FRUIT_OPTIONS);
    vi.useRealTimers();
    expect(await screen.findByText("Apple")).toBeDefined();
    expect(screen.getByText("Banana")).toBeDefined();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

describe("MultiCombobox", () => {
  it("checks multiple items as chips, then removes one on click", async () => {
    renderWithProviders(<MultiHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    fireEvent.click(await screen.findByText("Apple"));
    openCombobox(input);
    fireEvent.click(await screen.findByText("Banana"));

    // 下拉列表仍开着，同一个 "Apple"/"Banana" 文本会同时出现在 chip 和列表项里，
    // 用 chips 容器（role="toolbar"）限定查询范围，避免 getByText 因多处命中报错。
    const chipsBar = screen.getByRole("toolbar");
    await within(chipsBar).findByText("Apple");
    within(chipsBar).getByText("Banana");

    // 官方 ComboboxChip 的移除按钮只有一个 XIcon，没有 aria-label；按 chip 容器定位而非可访问名。
    const appleChip = within(chipsBar)
      .getByText("Apple")
      .closest('[data-slot="combobox-chip"]') as HTMLElement;
    fireEvent.click(appleChip.querySelector("button") as HTMLElement);
    await waitFor(() => expect(within(chipsBar).queryByText("Apple")).toBeNull());
    expect(within(chipsBar).getByText("Banana")).toBeDefined();
  });

  it("remote mode: selected chip labels survive a search term change (label cache)", async () => {
    const loadOptions = vi.fn(async (search: string): Promise<ComboboxOption[]> => {
      if (!search) return FRUIT_OPTIONS;
      return FRUIT_OPTIONS.filter((o) =>
        typeof o.label === "string" ? o.label.toLowerCase().includes(search.toLowerCase()) : true,
      );
    });
    renderWithProviders(<MultiHarness options={undefined} loadOptions={loadOptions} />, {
      messages: comboboxMessages,
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    await waitFor(() => expect(loadOptions).toHaveBeenCalled());
    fireEvent.click(await screen.findByText("Apple"));

    // 搜索词切换到一个 Apple 不会命中的查询，chip 的 label 仍应留在屏幕上（内部缓存）。
    // 种子机制还会让 Apple 继续钉在下拉列表里，所以此时页面上有两个 "Apple" 文本节点
    // （chip + 列表项），用 getAllByText 断言至少一个而非唯一一个。
    fireEvent.change(input, { target: { value: "banana" } });
    await waitFor(() => expect(screen.getAllByText("Banana").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Apple").length).toBeGreaterThan(0);
  });
});

describe("Combobox disabled", () => {
  it("renders a disabled input that ignores interaction", async () => {
    renderWithProviders(<SingleHarness disabled />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});

describe("Combobox render cap", () => {
  const MANY: ComboboxOption[] = Array.from({ length: 150 }, (_, i) => ({
    value: `tz-${i}`,
    label: `Zone/${i < 30 ? "Asia" : "Other"}-${i}`,
  }));

  function ManyHarness() {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Combobox value={value} onChange={setValue} options={MANY} />;
  }

  it("renders at most 100 options and shows a truncation hint", async () => {
    renderWithProviders(<ManyHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    await screen.findByText("Zone/Asia-0");
    expect(screen.getAllByRole("option").length).toBe(100);
    expect(screen.getByText(/50 more matches/)).toBeDefined();
  });

  it("lifts the cap once typing narrows the list", async () => {
    renderWithProviders(<ManyHarness />, { messages: comboboxMessages });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    openCombobox(input);
    await screen.findByText("Zone/Asia-0");
    fireEvent.change(input, { target: { value: "Asia" } });
    await waitFor(() => expect(screen.queryByText(/more matches/)).toBeNull());
    expect(screen.getAllByRole("option").length).toBe(30);
  });
});
