import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useState } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";

export interface MentionSuggestionOptions<T> {
  /** 触发字符，如 `@`（成员）、`#`（任务）。 */
  char?: string;
  /**
   * 按输入的关键字搜索候选。每次按键都会调用；上一轮未完成的请求经 `signal` 取消，
   * 晚到的旧结果会被丢弃，不会盖掉新结果。
   */
  search: (query: string, signal: AbortSignal) => Promise<T[]>;
  getId: (item: T) => string;
  /** 写进 Mention 节点的 `label`，也是默认的候选项文本。 */
  getLabel: (item: T) => string;
  /** 自定义候选项的渲染（头像、任务编号等）；默认只显示 label。 */
  renderItem?: (item: T) => ReactNode;
  /** 防抖毫秒数，默认 150。 */
  debounceMs?: number;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface MentionListProps<T> extends MentionSuggestionOptions<T> {
  query: string;
  select: (item: T) => void;
  ref?: Ref<MentionListHandle>;
}

type SearchState<T> =
  | { status: "loading"; items: T[] }
  | { status: "done"; items: T[] }
  | { status: "error"; items: T[] };

function MentionList<T>({
  query,
  select,
  search,
  getId,
  getLabel,
  renderItem,
  debounceMs = 150,
  ref,
}: MentionListProps<T>) {
  const L = useLocalization();
  const [result, setResult] = useState<SearchState<T>>({ status: "loading", items: [] });
  const [active, setActive] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult((previous) => ({ status: "loading", items: previous.items }));
    const timer = setTimeout(() => {
      search(query, controller.signal).then(
        (items) => {
          if (controller.signal.aborted) return;
          setResult({ status: "done", items });
          setActive(0);
        },
        () => {
          if (!controller.signal.aborted) setResult({ status: "error", items: [] });
        },
      );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, search, debounceMs]);

  const { items } = result;

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setActive((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((index) => (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[active];
        if (item !== undefined) select(item);
        return true;
      }
      return false;
    },
  }));

  const activeItem = items[active];
  return (
    // 焦点一直留在编辑器里，键盘导航由 onKeyDown 转发；cmdk 只负责呈现与受控高亮，不做过滤。
    <Command
      shouldFilter={false}
      value={activeItem === undefined ? "" : getId(activeItem)}
      className="w-64 rounded-md border border-border shadow-md"
    >
      <CommandList>
        {items.length === 0 && (
          <CommandEmpty>
            {result.status === "loading"
              ? L("RichText:SuggestionLoading")
              : result.status === "error"
                ? L("RichText:SuggestionError")
                : L("RichText:SuggestionEmpty")}
          </CommandEmpty>
        )}
        {items.map((item, index) => (
          <CommandItem
            key={getId(item)}
            value={getId(item)}
            onSelect={() => select(item)}
            onMouseEnter={() => setActive(index)}
          >
            {renderItem ? renderItem(item) : getLabel(item)}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/**
 * 生成 Mention 扩展的 `suggestion` 配置：候选列表用 Command 原语渲染，数据来自调用方的异步搜索。
 *
 * ```ts
 * Mention.configure({
 *   suggestion: createMentionSuggestion({ char: "@", search: searchMembers, getId: (m) => m.id, getLabel: (m) => m.name }),
 * })
 * ```
 * 同一编辑器挂多个 Mention（`@` 和 `#`）时，各自 `Mention.extend({ name: "taskRef" })` 并给不同的 `char`。
 */
export function createMentionSuggestion<T>(
  options: MentionSuggestionOptions<T>,
): Omit<SuggestionOptions<T, MentionNodeAttrs>, "editor"> {
  const { char = "@" } = options;
  return {
    char,
    // 搜索由列表组件自己做（带取消与防抖）；不走 Suggestion 的 items，免得慢请求阻塞输入。
    items: () => [],
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, MentionListProps<T>> | undefined;
      let stopAutoUpdate: (() => void) | undefined;
      let rect: SuggestionProps<T, MentionNodeAttrs>["clientRect"];

      const listProps = (props: SuggestionProps<T, MentionNodeAttrs>): MentionListProps<T> => ({
        ...options,
        query: props.query,
        select: (item) => props.command({ id: options.getId(item), label: options.getLabel(item) }),
      });

      const reference = {
        getBoundingClientRect: () => rect?.() ?? new DOMRect(),
      };

      const position = () => {
        const element = renderer?.element;
        if (!(element instanceof HTMLElement)) return;
        void computePosition(reference, element, {
          placement: "bottom-start",
          strategy: "fixed",
          middleware: [offset(4), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          element.style.left = `${x}px`;
          element.style.top = `${y}px`;
        });
      };

      const teardown = () => {
        stopAutoUpdate?.();
        stopAutoUpdate = undefined;
        renderer?.element.remove();
        renderer?.destroy();
        renderer = undefined;
      };

      return {
        onStart: (props) => {
          rect = props.clientRect;
          renderer = new ReactRenderer(MentionList<T>, {
            props: listProps(props),
            editor: props.editor,
          });
          const element = renderer.element;
          if (element instanceof HTMLElement) {
            element.style.position = "fixed";
            element.style.zIndex = "50";
            document.body.appendChild(element);
            stopAutoUpdate = autoUpdate(reference, element, position);
          }
        },
        onUpdate: (props) => {
          rect = props.clientRect;
          renderer?.updateProps(listProps(props));
          position();
        },
        onKeyDown: ({ event }) => {
          if (event.key === "Escape") {
            teardown();
            return true;
          }
          return renderer?.ref?.onKeyDown(event) ?? false;
        },
        onExit: teardown,
      };
    },
  };
}
