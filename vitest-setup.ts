/**
 * 测试环境滞后于标准所致的噪音过滤。**只按完整字符串挡掉逐条列明的已知项**，这里不是警告
 * 垃圾桶，泛化匹配会连真问题一起吞掉。每条都要写清「上游缺什么」与「何时可以删」。
 *
 * 1. `<search>`（HTML Living Standard，2023）：jsdom 至今（v25/v30 均已实测）没实现它，
 *    `document.createElement("search")` 返回 `HTMLUnknownElement`，React 于是在每次渲染
 *    查询区时喊一次 unrecognized tag。浏览器侧无此问题（Chrome 实测为 `HTMLElement`，
 *    可访问角色与 `div role="search"` 同构），产品代码不该为测试环境退化成 ARIA 写法。
 *    jsdom 实现该元素后删掉本条。
 */
/** React 用 `%s` 占位符传标签名（`console.error("The tag <%s> is unrecognized…", "search")`），
 * 所以匹配模板串之外还要核对参数里的标签名，只挡 `search` 这一个标签，别的未知标签照报。 */
const IGNORED_ENV_WARNINGS: { template: string; args: string[] }[] = [
  { template: "The tag <%s> is unrecognized in this browser.", args: ["search"] },
];

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  const ignored =
    typeof first === "string" &&
    IGNORED_ENV_WARNINGS.some(
      (entry) =>
        first.includes(entry.template) && entry.args.every((value) => args.includes(value)),
    );
  if (ignored) return;
  originalError(...args);
};
