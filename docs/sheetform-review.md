# SheetForm 评审记录

对 `components/form/sheet-form.tsx` 及其在图书页（`useAbpSheet` + `useAbpTable`）中的实际使用所做的评审。**全部在真实后端（AbpSwagger）+ 真实数据上操作得出**，每条附可复现的实测。

本文只记录**功能与规范层面的问题**。观感与用法层面的设计提案见 [`sheetform-design.md`](sheetform-design.md)。

分档：A = 用户会撞到的行为缺陷；B = 与本仓设计规范冲突；C = 成色。

---

## A 档：行为缺陷

### A1. 底部操作栏会随内容滚走 ✅ 已修

视口高 420px 时实测：底部栏底边在 `y=579`，视口只有 420——**「保存」与「取消」完全在屏幕外**，而表单只有 5 个字段。

根因在结构：`<form>` 自身是滚动容器（`overflow-y-auto`），`SheetFooter` 是它的子节点，于是操作栏跟着内容一起滚。同一个抽屉里，标题栏固定而操作栏不固定。

```tsx
// 现状
<form className="flex flex-1 flex-col overflow-y-auto">
  <div className="flex-1 space-y-4 px-4 py-2">{children}</div>
  {editable && <SheetFooter>…</SheetFooter>}   {/* 跟着滚 */}
</form>
```

修法是把滚动下移一层：`form` 用 `overflow-hidden`，字段区 `flex-1 overflow-y-auto`，footer 留在 form 的流里但不进滚动区。

### A2. Esc 实际上永远不工作 ✅ 已修

焦点在文本框内按 Esc，`data-state` 保持 `open`（浏览器在输入框里消费了这个键，事件到达 document 时已 `defaultPrevented`）；把焦点移到抽屉容器上再按 Esc，立刻变 `closed`。

而表单打开即自动聚焦第一个字段——所以**对用户而言，模态的标准退出键是坏的**。

**修法**：在 `SheetContent` 上兜一层 `onKeyDown`，不依赖 Radix 的默认路径。

### A3. 没有未保存保护 ✅ 已修

填入内容后点「取消」或右上角 ×，直接丢弃，无任何提示。

**修法**：把 Esc、×、取消按钮、点遮罩**四条关闭路径统一收敛到一个 `requestClose()`**——分散判断迟早漏掉一条，而「哪一条漏了」只有用户丢了数据才会发现。`useAbpSheet` 把 `isDirty` 交给 `SheetForm`（查看态恒为假），脏了就先弹确认。确认框的「放弃」用 destructive 红：丢弃已填内容是不可逆的，而红色在这套系统里正是留给不可逆动作的。

---

## B 档：与本仓设计规范冲突

### B4. 底部是两个全宽按钮竖排 ✅ 已修

实测：两个按钮各 415px 宽，底部区共占 112px 高，`flex-direction: column`。这是移动端布局出现在 448px 宽的桌面抽屉里。

而 `DESIGN.md` 的整页表单规范写的是「操作按钮在容器底部行 `justify-end`，primary 最右」。同一产品的两种表单，操作区语法不同。这是 shadcn `SheetFooter` 的默认值（`mt-auto flex flex-col gap-2 p-4`）未经定制的结果。

### B5. 同一产品里两套日期体验 ✅ 已修

| 位置 | 组件 | 实际观感 |
| --- | --- | --- |
| 表格查询筛选 | `DateField` → `DatePicker` | Popover 日历，本地化 |
| 新增/编辑抽屉 | `TextField type="date"` | 原生输入，中文界面下显示 `mm/dd/yyyy` |

仓库自带 `DatePicker` / `DateRangePicker` / `DateTimePicker`，抽屉里却用了原生控件。而 `TextField` 的类型联合里就写着 `"date"`——这个逃生口被做成了随手可选的默认，下一个人还会用。建议连同类型一起收掉。

### B6. 间距做不出分组 ✅ 已修

实测：标签→控件 12px，字段→字段 16px。

`DESIGN.md` 的规则是「相关的靠紧、不相关的拉开，**间距本身就是分组信号**」。1.33 倍的差读不出层次——标签和它自己的控件，与两个毫不相干的字段之间，几乎一样远。

---

## C 档：成色

- **价格字段预填 `0` 且带必填星号**——一个永远不会触发的必填（`0` 通过非空校验），用户还得先删掉 `0` 才能输入。
- **标题只有「新增」**，没有宾语，不知道在新增什么。标题由 `useAbpSheet` 用 `Crud:Create` 词条硬给，调用方无法补充宾语。
- **滚动区无边界提示**：内容可滚时，底部栏与字段区之间没有分隔线或阴影，滚动时会糊在一起。
- ~~**`view` 模式没有入口**~~ —— **这条我写错了**。行操作菜单里确实只有「编辑 / 删除」，但**点击整行**就进查看态。`use-abp-table` 的判定是 `showView = row.view ?? (row.click === false && onOpen)`：查看只在「行点击被显式关掉」时才补进菜单，否则整行就是它的入口。我只翻了菜单，没点行。

---

## 复现环境

- 后端：`/Users/zhjie/repose/Github/jc-stack/AbpSwagger`，`dotnet run --project src/AbpSwagger.HttpApi.Host`（`https://localhost:44316`，SQLite 自带种子数据，OpenIddict 客户端已注册 `http://localhost:5173/api/auth/callback`）
- 前端：`examples/starter`，`vite dev`（`http://localhost:5173`）
- 页面：组件演示 → 图书（`/books`），12 条种子数据
