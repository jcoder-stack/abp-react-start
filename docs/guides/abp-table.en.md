# abp-table: list pages and CRUD maintenance pages

Using the ABP demo backend's `Book` entity as the example, this walks through "the framework is installed — how do I add a list + create/edit/detail page for my own entity". The table side and the form side are two hooks that never import each other — `useAbpTable` owns list/query/delete, `useAbpSheet` owns the create/edit drawer form; both return **instances**, with components living on the instance (`t.Table`, `sheet.Sheet` and other bound members). You don't handwrite mechanics like paging or permission checks, and you don't wire `table`/`crud`/`queryForm` into separate props of some assembly component.

The complete runnable reference is this repo's [`examples/starter/src/routes/_layout/_authed/books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) — it uses tabs to show L0 (standard `useAbpTable`/`useAbpSheet`), L1 (the `source` callback), and L2 (plain `DataTable`) side by side on one page. Every snippet below is condensed from it; when in doubt, read that file.

> English edition. 中文版见 [`abp-table.md`](abp-table.md)。

## Prerequisites

- `jc-abp init` has run (full steps in [`initialize-a-project.en.md`](initialize-a-project.en.md); for selective installs see [`install-blocks.en.md`](install-blocks.en.md) — `data-table`, `combobox`, `date-picker`, `form`, and `abp-crud` must be installed before `abp-table`/`abp-sheet`; blocks don't auto-recurse). `src/components/abp/crud/crud-service.ts`, `use-abp-table.ts`, `use-abp-sheet.tsx`, and `abp-table.tsx` are in place (internal implementation files land with them; page code only imports `useAbpTable`/`useAbpSheet` from `use-abp-table.ts`/`use-abp-sheet.tsx`).
- Your ABP backend's swagger already has the target entity's application service endpoints (the demo backend ships `BookAppService`: `GET/POST /api/app/book`, `GET/PUT/DELETE /api/app/book/{id}`). For your own entity, write the CRUD application service on the backend first, confirm the endpoints appear in swagger, then come back for the frontend.

Below is the `Book` walk-through.

## ① Confirm/rerun `jc-abp gen`

`jc-abp gen` reads the swagger pointed at by `abp.api.config.ts` (or the `--input`/`--output` flags) and generates the react-query client into `src/api/` via orval. **Don't hand-edit the output** — rerunning the command overwrites it whole.

```bash
npx jc-abp gen
```

Afterwards the target entity's artifacts appear in three places (using `Book`):

- `src/api/endpoints/book/book.ts`: orval-generated CRUD functions and react-query hooks, e.g. `getApiAppBook` (list, function form), `useGetApiAppBook` (list hook), `usePostApiAppBook` (create), `usePutApiAppBookId` (update), `useDeleteApiAppBookId` (delete).
- `src/api/models/`: `AbpSwaggerBooksBookDto` (the row/detail DTO), `AbpSwaggerBooksCreateUpdateBookDto` (the write DTO shared by create/update).
- `src/api/schemas/book/book.ts`: `postApiAppBookBody` (the zod schema — the base for step ③'s form validation).
- If a relation field needs a remote dropdown (`Book.authorId` → `Author`), the corresponding `getApiAppAuthor` is generated too; step ③ uses it.

If swagger doesn't have the endpoints yet, add the backend application service first; `jc-abp gen` only converts "swagger → frontend client" and won't invent endpoints for you.

> **The Book in `examples/starter` is an exception**: it does not come from `jc-abp gen`. Book/Author endpoints exist only in the ABP BookStore tutorial; a backend from `abp new` doesn't have them, and had the example generated from swagger for real, it would stop compiling against any other backend. So those demo pages read `routes/_layout/_authed/books/-book-api.ts` — a handwritten in-process mock (server functions providing server-side paging/sorting/filtering and ABP-shaped validation errors) whose export names match the orval output verbatim, keeping the page code isomorphic to your real project. **Your own entities go through `jc-abp gen`; don't copy that file.**

## Imports used on this page

The snippets below omit imports for focus. Listed once, take as needed:

```ts
import { createCrudService } from "@/components/abp/crud/crud-service"
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet"
import { useAbpTable } from "@/components/abp/table/use-abp-table"
import { QueryDateRange } from "@/components/abp/table/query-date-range"
import type { TableColumnDef } from "@/components/data-table/table-core"
```

`TableColumnDef` is the easiest to miss — it lives in `data-table/table-core`, not imported directly from `@tanstack/react-table` (native `ColumnDef`'s first generic slot is `TFeatures`, not `TData`; using it directly errors with `TS2559`).

## ② `createCrudService`: the service descriptor

`createCrudService({...})` is a pure data descriptor — it binds step ①'s generated react-query hooks into the four slots `useList`/`useCreate`/`useUpdate`/`useDelete`. `useList` is always required; `useCreate`/`useUpdate`/`useDelete` are all optional — omit one, and that capability **ceases to exist on the type** of `service` (not "present but `undefined`"). `useAbpTable` uses that to decide whether to render the create/edit/delete entry points, and `useAbpSheet` requires a service carrying both create and update (expanded in "Read-only list pages" below). `TDto`/`TCreate`/`TUpdate` are inferred from the hooks you pass — do **not** pass explicit type parameters (`createCrudService<TDto, TCreate, TUpdate>({...})` still compiles, but it drops `supportsFilter`'s compile-time constraint back to the loose default; see "`supportsFilter`" below).

```ts
import {
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/api/endpoints/book/book";

const bookService = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,   // invalidation prefix: one sweep clears every paging state after save/delete
  supportsFilter: false,               // the book endpoint has no Filter param; required here and only false compiles (enforced at compile time, see below)
});
```

**Why hook references, not bare functions**: the descriptor passes orval's react-query hooks straight through, and `useAbpTable`/`useAbpSheet` consume them internally — no handwritten `queryFn`/`mutationFn`. `listKey` plugs into orval's query-key namespace (`getGetApiAppBookQueryKey()` is the prefix shared by every paging state of the endpoint); after a successful save/delete both hooks use it to invalidate every paging/sorting/filter combination at once, with no page-side key assembly.

### Read-only list pages: pass no mutations

Omit all three keys besides `useList` and the service is purely read-only — `useAbpTable` hides the create/edit/delete entries, and **passing this service to `useAbpSheet` is a compile error** (its parameter type requires both the create and update hooks). The demo below uses the repo's real book endpoint — same endpoint, but taking only `useList` here (the real `books` page adds all three back in step ③; this deliberately keeps the read-only half for contrast, not a new endpoint):

```ts
const bookListOnlyService = createCrudService({
  useList: useGetApiAppBook,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

const t = useAbpTable(bookListOnlyService, { columns });
return <t.Table />;
```

Three points:

- **How to set `policy`**: `policy` is a prefix string; `createCrudService` derives `resolvedPolicies.create/update/delete` per the ABP convention (`X` → `X.Create`/`X.Update`/`X.Delete`), and `useAbpTable`/`useAbpSheet` use those to decide whether the create/edit/delete buttons render. If the target application service actually carries the permission attribute (like Identity's user service requiring `AbpIdentity.Users`), pass `policy: IdentityPermissions.Users.Default`; if the backend defines no policy for the service (the demo's `BookAppService` is like that), **pass no `policy`** — `source.can.*` all resolve to `true`, matching `books/index.tsx`. If the three granularities don't line up (say delete alone has its own policy name), override individually with `policies: { create, update, delete }` instead of prefix derivation. No bare policy strings: first add constants for your business module in `src/permissions.ts` following the ABP definition-class format (e.g. `BookPermissions`), then reference them.
- **How `supportsFilter` is decided**: no longer eyeballing — as long as you call `createCrudService` in inference form (no explicit type parameters), the field's value is constrained at compile time by the `useList` endpoint's parameter type: no `Filter` field on the params means `supportsFilter` is **required and only `false` compiles** (omitting it or passing `true` are both compile errors); with a `Filter` field it stays optional, defaulting to `true`. `GetApiAppBookParams` has no `Filter` field (it has `Name`/`MinPublishDate`, used in step ⑥), so `bookService` must pass `supportsFilter: false` — `t.Table` then hides the search box outright instead of rendering a dead input. By contrast `GetApiIdentityUsersParams` carries `Filter?: string`, so `identity/users.tsx` can omit it. **The constraint relies on inference**: adding explicit type parameters back silently drops it to the loose default (as if the endpoint always had `Filter`) — that's not a fix, it's turning the check off.
- **The service is a pure data descriptor**; `useAbpTable`/`useAbpSheet` each read only the parts they need — one `bookService` can feed both hooks at once (`books/index.tsx` does), or just `useAbpTable` (read-only pages need no `useAbpSheet`).

## ③ `useAbpSheet`: the form side

A list + three-state drawer form doesn't hand-wire the sheet state machine, the `useAppForm` options, or the create/update dispatch — all of it, along with optimistic-concurrency `concurrencyStamp` round-tripping and the `defaultValues` reset timing (see "Built-in behavior" below), is inside `useAbpSheet(service, opts)`. The page supplies the value shape, the DTO mappings, and the schema:

```tsx
interface BookFormValues {
  name: string;
  authorId: string;
  type: string;
  publishDate: string;
  price: number;
}

const EMPTY_VALUES: BookFormValues = {
  name: "",
  authorId: "",
  type: "0",
  publishDate: "",
  price: 0,
};

/** Can't use the default mapping: SelectField has a string value domain (enum String/Number round trip),
 *  and publishDate needs the date-only slice. */
function toRecordValues(record: AbpSwaggerBooksBookDto): BookFormValues {
  return {
    name: record.name ?? "",
    authorId: record.authorId ?? "",
    type: String(record.type ?? 0),
    publishDate: record.publishDate ? record.publishDate.slice(0, 10) : "",
    price: record.price ?? 0,
  };
}

/** Can't use the default mapping: SelectField string domain, date-only slice;
 *  create/update share one mapping, hence the name toInput rather than toCreateInput/toUpdateInput. */
function toInput(value: BookFormValues): AbpSwaggerBooksCreateUpdateBookDto {
  return {
    ...value,
    type: Number(value.type) as AbpSwaggerBooksCreateUpdateBookDto["type"],
  };
}

function BooksPage() {
  const L = useLocalization();

  // Base it on the generated body schema: backend constraints like max(128) are inherited for free;
  // `type` is the form SelectField's string domain, conflicting with the generated number literal
  // union — omit, then redeclare.
  const bookSchema = postApiAppBookBody.omit({ type: true }).extend({
    type: z.string(),
    name: z.string().trim().min(1, L("App::BookNameRequired")).max(/* … */),
    authorId: z.string().min(1, L("App::BookAuthorRequired")),
    publishDate: z.string().min(1, L("App::BookPublishDateRequired")),
    price: z.number(L("App::BookPriceRequired")).min(0, L("App::BookPriceInvalid")),
  });

  const sheet = useAbpSheet(bookService, {
    emptyValues: EMPTY_VALUES,
    toValues: (record: AbpSwaggerBooksBookDto) => toRecordValues(record),
    toCreate: toInput,
    toUpdate: toInput,
    schema: () => bookSchema,
  });

  // …columns in step ④, t in step ⑤

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">
        {L("App::Books")}
      </h1>
      {/* …t.Table in step ⑤ */}
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField label={L("App::BookName")} required disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>
        {/* …authorId/type/publishDate/price are analogous; full code in examples/starter/src/routes/_layout/_authed/books/index.tsx */}
      </sheet.Sheet>
    </section>
  );
}
```

Key points:

- **`toValues`/`toCreate`/`toUpdate` are the only DTO mappings the page writes, and all three can be omitted**: absent, `toValues` defaults to picking the `emptyValues` keys off the record with null/undefined falling back to the empty value; `toCreate`/`toUpdate` default to the identity transform (allowed only when the form value type is structurally assignable to the DTO — a compile-time conditional requirement; a shape mismatch makes the omission a compile error, not a runtime surprise). `roles.tsx` passes none of the three because its form shape ≡ a DTO subset — the boilerplate is gone (don't paste back a mapping that does nothing). There are two distinct reasons to write mappings explicitly — see "When explicit mappings are mandatory" below. `toValues(record, mode)` converts the row DTO into form values (it may prefetch related data asynchronously — `identity/users.tsx` first `GET .../roles` once and merges roles into the form values; returning `null` cancels the open, with the caller doing its own messaging).
- **`schema` is function-shaped** `(mode) => zodSchema`, not a bare schema — mode-dependent required rules ("required only in create") branch on `mode` here. `books`/`roles` have no mode-dependent fields, so `schema: () => bookSchema` is the minimal form; the `password` field in `identity/users.tsx` and `adminEmailAddress`/`adminPassword` in `tenants/index.tsx` are `mode === "create"` ternary examples.
- **`sheet.Sheet` lays down the three-state chrome** (title/pending/canEdit/onEdit/open/onOpenChange); the page just fills in fields.
- **Conditional fields use `sheet.mode`** (e.g. `{sheet.mode === "create" && <sheet.form.AppField ...>}` — the `password` field in `identity/users.tsx` and `adminEmailAddress`/`adminPassword` in `tenants/index.tsx`); the row record is `sheet.record` (e.g. seeding a relation field's label, the `authorSeed` pattern in `books/index.tsx`); read-only mode is `sheet.readOnly`.
- **`sheet.form` is an ordinary `useAppForm` return value** — `AppField`/`AppForm`/`FormErrors`/`Subscribe` as usual; the standard form recipe's underpinnings (the trio, `abpSubmitValidator`) are in [`forms.en.md`](./forms.en.md).

Fields render through `sheet.form.AppField` + the pre-bound components; `label`/the required asterisk (`RequiredMark`)/`aria-required`/`data-invalid`/inline `FieldError` are all internal — the page passes semantic props only. View mode is the same `disabled={sheet.readOnly}` graying, not a second read-only rendering. The number field (`field.NumberField`) already handles the "bare `Number()` on an empty string silently becomes `0`" trap (maps to `NaN` for `z.number()` to fail, displays back as empty) — use it directly, don't rewrite that conversion.

Relation fields (`authorId`) go through `field.ComboboxField` remote search — see the `loadAuthorOptions` degraded form under "Common traps", item 1.

### When explicit mappings are mandatory

Whether `toValues`/`toCreate`/`toUpdate` can be omitted is not eyeballing — but there are two distinct kinds of "must", and conflating them leads to deleting a mapping as "redundant" when it isn't:

**① Type-level conditional requirement: shapes mismatch, omission fails to compile.** `AbpSheetOptions`' `toCreate`/`toUpdate` are conditional types — omission is allowed only while `TValues extends TCreate` (or `TUpdate`) holds; when it doesn't (the form value type is missing a DTO-required field, or a field type is incompatible), `toCreate`/`toUpdate` become required parameters and omission is a compile error. You don't judge these; the compiler does:

- **Value-domain conversion**: `toInput` in [`books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) — the `type` field is a string domain in `SelectField` but a number literal union in the DTO; structurally incompatible, so omitting `toInput` doesn't compile.

**② The form shape matches the DTO structurally, but business rules demand narrowing.** The compiler **won't catch these** — omission is fully legal at the type level (`TValues extends TCreate/TUpdate` still holds), but the default identity transform would send fields that shouldn't go; write them explicitly:

- **Async prefetch of related data**: `toValues` in [`identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx) — the user DTO carries no `roleNames`; opening first does a `GET .../roles` and merges roles into the form values.
- **Sensitive fields never echoed back**: also `identity/users.tsx` — `toRecordValues` pins `password` to an empty string, and `toUpdateInput` simply doesn't map the key; empty means "unchanged".
- **Empty string normalized to undefined**: `toCreateInput`/`toUpdateInput` in `identity/users.tsx` do `value.x || undefined` for `name`/`surname`/`phoneNumber`, so "the user didn't fill it in" isn't misreported as "the user cleared it".
- **Preventing field leakage (asymmetric create/update field sets)**: `toUpdateInput` in [`tenants/index.tsx`](../../examples/starter/src/routes/_layout/_authed/tenants/index.tsx) — `create` additionally accepts `adminEmailAddress`/`adminPassword` (seed admin at tenant creation), while `TenantUpdateDto` itself requires only `name`. `TenantFormValues` structurally **still satisfies** `extends TenantUpdateDto` (the two extra fields don't affect assignability), so at the type level `toUpdate` **could** be omitted — but then the default identity transform would push those two empty strings into the PUT body, leaning on the backend's implicit "ignore unknown properties" contract instead of letting the interface shape speak. `toUpdate: (value) => ({ name: value.name })` is thus a business/security choice, not compiler-forced — that's exactly what the "toUpdate kept explicit" comment in the page component is saying. For the case the type layer truly forces, see the negative case in [`test/abp-sheet-contract.test-d.ts`](../../examples/starter/test/abp-sheet-contract.test-d.ts) — "the target DTO has a required field TValues lacks".

When either reason applies, put a one-line TSDoc on the function saying why, so the next reader can tell "this is real business, not un-migrated boilerplate". Outside these cases — when the form shape truly equals a DTO subset (like `roles.tsx`) — omitting is the minimal change.

### Validation schemas: base them on the generated body schema

Don't handwrite a blank `z.object({...})` — `jc-abp gen` already compiled the backend DTO's validation attributes (`[Required]`/`[StringLength]` etc.) into the body schemas under `@/api/schemas/<module>/<module>` (e.g. `postApiIdentityRolesBody`). A handwritten schema copies the required rules and drops length constraints like `max`; over-length input then travels all the way to the backend for a 400. Use the generated schema as the base and `.extend()` only what the UI needs that the generated side lacks (`trim`, localized required messages); `max` and friends are inherited as-is:

```tsx
// roles.tsx's name rules live in the sibling -role-schema.ts (see below), exported as a named
// factory rather than a local inside the page component — validation rules are part of the page's
// observable behavior; tests must hook the real artifact, not a replica.
export function buildRoleSchema(L: Localize) {
  return postApiIdentityRolesBody.extend({
    name: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .max(postApiIdentityRolesBodyNameMax, L("Form:MaxLength", postApiIdentityRolesBodyNameMax)),
  });
}

// inside the roles.tsx component:
const roleSchema = buildRoleSchema(L);
```

Three points:

- **Backend constraints inherited for free**: `.extend()` redeclares only the keys you override; unmentioned keys keep the generated schema's rules and types.
- **UI required-ness and localized messages via `extend`**: the generated `min(0)` means "non-negative length", not ABP's `[Required]` (it admits the empty string); the real required semantics, `trim`, and `L()` messages are redeclared per field in the `extend`.
- **Keys whose form domain conflicts with the generated one: `omit`, then redeclare** — like `books`' `type`: `SelectField`'s domain is string, the generated side is a number literal union; `.omit({ type: true })` first, then a `z.string()` in the `extend`.

**Name-export the schema factory so guards hook the real artifact**: validation rules (especially boundary values like `max`) are part of the page's observable behavior. If a component test replicates the same `.extend(...)` calls in its harness, the page can silently drift back to a handwritten schema missing `max` while tests stay green — the guard exists in name only. So lift the schema construction into a named exported factory and have tests `import` it for their harness. `roles.tsx` itself imports `@tanstack/react-start` server fns through `@/auth`, so a plain `vitest` environment without the `tanstackStart` vite plugin cannot import it directly (`Missing "#tanstack-router-entry" specifier`) — in that case, split the schema factory into a sibling `-`-prefixed file (like `identity/-role-schema.ts`; the route generator skips the prefix, so it's never mistaken for a route) depending only on `zod`/the generated body schema/`Localize` from `@jcoder-stack/abp-react/react`, and let the page and the test both import that one implementation.

## ④ Column definitions

`TableColumnDef<TDto>[]` (v9's native `ColumnDef` has `TFeatures` in the first generic slot, not `TData` — direct use errors with `TS2559`; `TableColumnDef` is the alias with the feature set pre-bound), with `header` going through `useLocalization()`'s `L()`:

```ts
const columns = useMemo<TableColumnDef<AbpSwaggerBooksBookDto>[]>(
  () => [
    { accessorKey: "name", header: () => L("App::BookName") },
    { accessorKey: "authorName", header: () => L("App::BookAuthor"), enableSorting: false },
    {
      accessorKey: "publishDate",
      header: () => L("App::BookPublishDate"),
      cell: ({ getValue }) => {
        const value = getValue() as string | undefined;
        return value ? value.slice(0, 10) : "";
      },
    },
  ],
  [L],
);
```

Using `L()` in `header` forces `columns` into the component body, while `columns` must also be referentially stable — `useAbpTable`'s internal `useDataTable` rebuilds the column model on every new array. Fortunately `useLocalization()` returns a stable `L`, so `useMemo(() => [...], [L])` is effectively a permanent memo and the two constraints don't clash. If columns reference other in-component values (some `useState`), add them to the deps array — don't skip any. Violating the stability contract logs a `console.warn` in DEV.

Relation fields (like `authorName`) and enum fields (like `type`) mostly don't support server-side sorting — set `enableSorting: false`; allowing sort on a column the backend never sorts is a no-op click.

**When the backend sort field differs from the column id**: `toAbpListParams` uses `column.id` verbatim in the `Sorting` parameter. If the frontend column is `authorName` but the backend wants `author.name`, set the column id explicitly to **the backend's name** and read the value via `accessorFn`:

```ts
{ id: "author.name", accessorFn: (row) => row.authorName, header: () => L("App::BookAuthor") }
```

Writing `accessorKey: "authorName"` sends `Sorting=authorName`, which the backend doesn't recognize — **no error, the sort just doesn't happen**.

### Multi-column sorting

- **How to use**: <kbd>Shift</kbd>-click a header to stack it as the second/third sort column (a plain click replaces, keeping only that column).
- **How to read**: with two or more sort columns, headers show a priority number after the name (1 = primary, 2 = secondary…); a single sort column shows none.
- **How to exit**: with two or more sort columns the toolbar automatically shows a "clear sorting" button — one click clears all — **it's there by default**. In single-column mode, clicking the header through its three-state cycle to "unsorted" also exits.

No extra backend wiring: `toAbpListParams` folds the multi-column state into a `Sorting` parameter like `"roleName,creationTime desc"`, and ABP's System.Linq.Dynamic natively supports the comma-separated multi-field expression — this is not fake frontend-drawn sorting.

## ⑤ `useAbpTable`: table-side wiring + JSX assembly

`useAbpTable(source, opts)` builds the query form, keeps structured filter params inside the hook, normalizes the service into an `AbpTableSource`, and builds the TanStack table instance — one call yields everything the page renders:

```tsx
const t = useAbpTable(bookService, {
  columns,
  selectable: true,
  query: { defaults: { Name: "", MinPublishDate: "" } },
  onOpen: sheet.open,
});
```

`onOpen: sheet.open` (the single wire between the two hooks) is everything the table side knows about "open the form" — `t` doesn't know or need to know what `sheet` looks like inside. No `onOpen` means a pure list page (the view/edit items don't render — a visible symptom, not a silent dead click).

`t`'s bound members, by their JSX position:

```tsx
return (
  <section className="space-y-4">
    <h1 className="text-2xl font-normal">
      {L("App::Books")}
    </h1>

    <t.Table>
      <t.QueryForm>
        <t.queryForm.AppField name="Name">
          {(f) => <f.TextField label={L("App::BookName")} />}
        </t.queryForm.AppField>
        <t.queryForm.AppField name="MinPublishDate">
          {(f) => <f.DateField label={L("App::BookPublishedAfter")} />}
        </t.queryForm.AppField>
      </t.QueryForm>

      <t.BulkBar>
        <t.BulkDelete />
      </t.BulkBar>
    </t.Table>

    <sheet.Sheet>{/* see step ③ */}</sheet.Sheet>
  </section>
);
```

`t.Table` accepts exactly three direct children — `t.QueryForm` (the query area, step ⑥), `t.BulkBar` (the bulk bar, step ⑨), and `t.Toolbar` (toolbar additions, step ⑩); omit one and that section doesn't appear, pass anything else and it's DEV-warned and ignored. These three bound members are **referentially stable across renders** (factory-produced, not new components each render). The remaining arrangement inside children (skeleton/empty/error states, pagination, the search box, the column visibility menu, the create button) is all laid down inside `t.Table`.

## ⑥ Structured filtering

The query area simply is TanStack Form — `t.queryForm` is a plain `useAppForm` return value, and `t.queryForm.AppField` is the one way to write fields, the same idiom as the form side's `sheet.form.AppField`. **Every rendered field name must be declared with an initial value in `query.defaults`** (even a string empty value, `Name: ""`) — `t.queryForm.AppField`'s `name` type is the keyof of the `query.defaults` object, not the full endpoint params type, so a typo like `name="Naem"` fails at compile time, and "rendered field not declared in defaults" — previously a runtime fallback/crash — becomes a compile error.

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: { defaults: { Name: "", MinPublishDate: "" } },
  onOpen: sheet.open,
});
```

```tsx
<t.QueryForm>
  <t.queryForm.AppField name="Name">
    {(f) => <f.TextField label={L("App::BookName")} placeholder={L("App::BookName")} />}
  </t.queryForm.AppField>
  <t.queryForm.AppField name="MinPublishDate">
    {(f) => <f.DateField label={L("App::BookPublishedAfter")} />}
  </t.queryForm.AppField>
</t.QueryForm>
```

Identical to [`books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) — this is the entire query area. `GetApiAppBookParams` has exactly two endpoint-specific query params, `Name`/`MinPublishDate`, and no upper-bound field, so the books page declares those two real fields and doesn't fabricate a `MaxPublishDate` the backend would silently drop.

The query area is not a separate card — `t.QueryForm`'s fields render into the **advanced filter panel** inside the table card: proper labels, a three-column grid, and the panel's own "Reset / Query" button row at the bottom. The panel starts collapsed, toggled by the funnel button in the top bar's right-side function group (same group as refresh/density/columns; it survives entering bulk mode). While the panel is open, the quick search box on the left yields — precise field filters and a fuzzy search on the same screen would be a duplicate entry. When collapsed with filters still active, the funnel shows a dot (screen readers get "N filters applied").

### `QueryDateRange`: one control for a range

When a two-ended field ("from–to date") belongs in the query area, use `QueryDateRange` — one `DateRangePicker` reading and writing two flat query params (`from`/`to` still map 1:1 to the backend DTO), with no hand-assembling two `t.queryForm.AppField`s like the old two-field form. **Every existing endpoint in this repo (book/users/roles/tenants) has only a single lower-bound param — none genuinely has an upper-bound field. With only a lower bound, use the single `f.DateField` form above** (what the `books` page actually uses). Below is the form for a hypothetical endpoint that truly has both date bounds — your endpoint must actually have both params to copy it:

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: { defaults: { Name: "", MinPublishDate: "", MaxPublishDate: "" } },
  onOpen: sheet.open,
});
```

```tsx
<QueryDateRange
  form={t.queryForm}
  from="MinPublishDate"
  to="MaxPublishDate"
  label={L("App::PublishDate")}
/>
```

`QueryDateRange` connects straight to `t.queryForm` — no `t.queryForm.AppField` wrapper; the component subscribes/writes both field names internally, and one range selection updates both ends. **With only a lower-bound param, use the single `f.DateField`** — never fabricate an upper-bound field the backend silently drops.

### How fields render

- No `options`: falls to `TextField` (`type="date"` renders `<input type="date">`).
- With `options`: falls to `SelectField`.
- Other controls (remote combobox, multi-select, switch): use the corresponding field component in `children` (`f.ComboboxField`/`f.MultiComboboxField`/`f.SwitchField`) — same components as the form side, same usage.

### `queryDefaults`: defaults live in one place

Defaults hang on `query.defaults`; fields themselves carry **no** `default`. The first frame issues one request already carrying these defaults (not an unfiltered request followed by a filtered one after mount — that would flash unfiltered data); Reset returns to these defaults and takes effect immediately — the user doesn't have to click Query right after.

This is also how to mix in a fixed parameter (a tenant id, say): put a key in `query.defaults` with no corresponding `t.queryForm.AppField`. It stays in `defaultValues` and rides along on every submit and every reset — equivalent to the old `extraParams`, but the key name is constrained by the endpoint's param type, so typos fail at compile time.

### Computed defaults must be computed in the route `loader`

"Default to the last week" is the most common real default — and the easiest to get wrong:

- **Computing `new Date()` during render breaks hydration** — server and client can straddle time zones or midnight and compute different dates.
- **"Last week" relative to which time zone** — ABP's tenant time zone is on the app config's `timing.timeZone.iana`; computing with the browser's local zone shows cross-timezone tenants the wrong window.

The correct form computes in the route's `loader`, reads it back via `Route.useLoaderData()`, and passes it into `query.defaults` — the `loader` runs once on the server during SSR, the result serializes to the client, and both ends hold the same value by construction:

```tsx
function lastWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export const Route = createFileRoute("/_layout/_authed/books/")({
  loader: () => ({ defaultSince: lastWeekIso() }),
  component: BooksPage,
})

function BooksPage() {
  const { defaultSince } = Route.useLoaderData()
  const t = useAbpTable(bookService, {
    columns,
    query: { defaults: { Name: "", MinPublishDate: defaultSince } },
    onOpen: sheet.open,
  })
  // ……
}
```

### Cross-field validation needs a concrete issue `path`

This validation hangs on `query.validators`:

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: {
    defaults: { Name: "", MinPublishDate: "", MaxPublishDate: "" },
    validators: {
      onDynamic: z
        .object({ MinPublishDate: z.string().optional(), MaxPublishDate: z.string().optional() })
        .refine((v) => !v.MinPublishDate || !v.MaxPublishDate || v.MinPublishDate <= v.MaxPublishDate, {
          message: L("App::BookDateRangeInvalid"),
          path: ["MaxPublishDate"], // anchor to a concrete field so the error renders inline there
        }),
    },
  },
});
```

Without a `path` on the `.refine` issue, the error lands in `errorMap.onDynamic`'s `""` bucket — the current `FormErrors` subscribes to `onSubmit` only, so nothing renders: the submit is blocked with zero visible feedback. DEV logs a `console.warn` for this, but the real fix is anchoring `path` to a concrete field.

### A reality check: most built-in ABP endpoints can't use this

Endpoints shipped by modules like `AbpIdentity`/`AbpTenantManagement` (users, roles, tenants) expose a single `Filter` string with no per-field query params. Structured filtering is for **your own business endpoints**, whose backend input DTO must actually carry the params — the standard shape is a custom `GetXxxListDto : PagedAndSortedResultRequestDto` with your business fields on it (i.e. the book endpoint's `Name`/`MinPublishDate` used in this section).

## ⑦ Route file placement

TanStack Start file routing; land at `src/routes/_layout/_authed/books/index.tsx` (`_layout` is the sidebar layout shell, `_authed` the sign-in guard shell — both pathless layout routes):

```tsx
export const Route = createFileRoute("/_layout/_authed/books/")({
  component: BooksPage,
});
```

**When `beforeLoad: requirePermission(...)` is needed**: only when step ② passed a `policy` (or the corresponding `policies`) to `createCrudService` — that is, the backend actually protects the application service with the permission attribute. `books/index.tsx` has no `beforeLoad` because the demo backend defines no policy for book; `identity/users.tsx` has the `AbpIdentity.Users` policy, so the route must match:

```tsx
import { IdentityPermissions } from "@/permissions";

export const Route = createFileRoute("/_layout/_authed/identity/users")({
  beforeLoad: requirePermission(IdentityPermissions.Users.Default),
  errorComponent: RouteError,
  component: UsersPage,
});
```

`requirePermission` imports from `@/auth`; `errorComponent: RouteError` keeps route-level hard errors inside the content area with the sidebar in place (from `@/routes/shell-boundary`). The two policy names must match — `crud-service`'s `policy` only controls button visibility; what actually blocks access is the route's `beforeLoad`, and skipping it means the page is one URL away regardless of hidden buttons.

## ⑧ Row actions

The `row` config block sits on `useAbpTable`'s second parameter (reference must be stable: module-level function or `useCallback`):

```tsx
const t = useAbpTable(roleService, {
  columns,
  row: { menu: permissionMenuItem },
  onOpen: sheet.open,
});
```

`AbpTableRowConfig`'s six keys (`view`/`edit`/`delete` are three independent keys, merely shown on one line for their similar meaning):

| Key | Signature | Meaning |
|---|---|---|
| `menu` | `(row, table) => ReactNode` | Appended after the built-in "···" menu's three items (view/edit/delete) |
| `actions` | `(row, table) => ReactNode` | Inserted **left of** the built-in "···" menu, always visible in the row |
| `view`/`edit`/`delete` | `boolean` | Overrides the corresponding built-in item's default visibility |
| `click` | `false \| ((row) => void)` | Overrides the default "click row opens detail"; `false` disables |

Built-in default visibility: view — `click === false && onOpen !== undefined` ("view" appears only when row-click is off; both on would give one action two entries); edit — `source.can.update && onOpen !== undefined`; delete — never on a read-only service (no `useDelete`), otherwise per `source.can.delete`. When the menu has zero items, the "···" trigger doesn't render at all — no button that opens into nothing.

**Real usage**: [`identity/roles.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/roles.tsx) and [`identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx) both use `row.menu` to fold "Permissions" into the "···" menu (not always-visible inline):

```tsx
// Reference must be stable: it's a dep of useAbpTable's columns memo; an inline arrow rebuilds
// the column model every render (DEV churn warning).
const permissionMenuItem = useCallback(
  (row: VoloAbpIdentityIdentityRoleDto) =>
    canManagePermissions ? (
      <DropdownMenuItem onSelect={() => setPermissionsFor(row)}>
        <KeyRound />
        {L("Admin:Permissions")}
      </DropdownMenuItem>
    ) : null,
  [canManagePermissions, L],
);

const t = useAbpTable(roleService, { columns, row: { menu: permissionMenuItem }, onOpen: sheet.open });
```

High-frequency, one-click actions fit `row.actions` (a permanent icon slot bought for discoverability — touch devices have no hover, and this is the only way to keep a frequent entry discoverable); low-frequency, one-more-click actions go in `row.menu`. The repo's roles/users pages fold "Permissions" into the menu, keeping the inline area restrained. The `row.actions` variant for comparison (not actual repo code):

```tsx
row: {
  actions: (row) =>
    canManagePermissions ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={L("Admin:Permissions")}
                  onClick={() => setPermissionsFor(row)}>
            <KeyRound />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{L("Admin:Permissions")}</TooltipContent>
      </Tooltip>
    ) : null,
}
```

**Taking over the arrangement**: `row.menu`/`row.actions` can only *add* — they cannot rearrange the "···" menu chrome itself or move the menu/inline slots relative to each other. For that, see L3 in the "Choosing a tier" section (forking `abp-table.tsx`).

## ⑨ The bulk bar

`t.BulkBar` is the bulk-mode container, appearing automatically when selection > 0, with page-determined contents. Bulk delete has a built-in, `t.BulkDelete` — the delete mutation and list invalidation are already on the source; writing it again per page would copy the same boilerplate into every CRUD page:

```tsx
<t.BulkBar>
  <t.BulkDelete />
</t.BulkBar>
```

`t.BulkDelete` brings its own confirmation dialog, per-item deletion, result summary, and selection backfill — zero page wiring. It renders `null` when `source.can.delete` is false; no need to wrap it in `{t.source.can.delete && …}`.

Other bulk actions you still write yourself — `t.selectedRows` (`TDto[]`) and `t.keepSelected` (`(ids: string[]) => void`) are the entry points, placed beside the built-in delete:

```tsx
<t.BulkBar>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => toast.success(L("App::ExportSelected", t.selectedRows.length))}
  >
    {L("App::ExportSelected", t.selectedRows.length)}
  </Button>
  <t.BulkDelete />
</t.BulkBar>
```

Key points:

- **Why N single deletes**: this ABP backend has no bulk-delete endpoint anywhere (all `DELETE /{id}`), so `t.BulkDelete` calls `source.delete` serially, never concurrently — ABP deletes often cascade related cleanup, and concurrent submits trip the backend's concurrency/deadlock protection, misreporting "backend refused" as "this row can't be deleted".
- **One toast only**: bulk goes through a separate mutation instance without callbacks. Single-delete's `onSuccess`/`onError` fire per item; reusing it for N rows means N toasts and N invalidation refetches. The batch invalidates once at the end.
- **Results summarized in three branches**: all succeeded `Crud:Deleted`; all failed `Crud:OperationFailed`; partial `Crud:BulkDeletePartialFailure` (`{0}` succeeded, `{1}` failed) — never report just "failed" and drop how many made it.
- **Failed rows stay selected**: succeeded rows disappear with the invalidation refetch and leave the selection naturally; failed rows are kept via `keepSelected`, so the user re-clicks once to retry rather than re-selecting.
- **Custom data sources supporting bulk delete** must provide the optional `many(ids) => Promise<{ failed: string[] }>` on `AbpTableSource.delete`; without it `t.BulkDelete` doesn't render and DEV warns (`createCrudService` output has it built in).

## ⑩ Toolbar additions

The top bar's right area (refresh · export · density · columns) is mostly built-in, no wiring: refresh refetches the current query with a spinning icon; density toggles comfortable/compact (row heights in DESIGN.md "Data tables", varying with inline action buttons), state in memory; the column visibility menu likewise. All three appear just by using `useAbpTable`/`t.Table`.

Export is the one slot-style capability — `useAbpTable(bookService, { onExport: () => exportCsv(t.getListParams()) })`: the export icon renders only when `onExport` is passed; the component library ships no export implementation (neither CSV nor XLSX is assumed). The click just forwards to your callback, and `t.getListParams()` returns the full currently-submitted request params (a snapshot of paging/sorting/search + structured filters — not the form draft); your code decides whether "export" means all matching rows or something else.

`t.Toolbar` appends content right of the built-in "create" button, for custom toolbar actions `onExport` can't express. No current page in this repo has such additions; below is the `t.Toolbar` equivalent of the `onExport` example above, only for when you need a custom button look instead of the built-in export icon:

```tsx
<t.Table>
  {/* …t.QueryForm / t.BulkBar above */}
  <t.Toolbar>
    <Button variant="outline" size="sm" onClick={() => exportCsv(t.getListParams())}>
      {L("App::ExportAll")}
    </Button>
  </t.Toolbar>
</t.Table>
```

`exportCsv` is your own export function (illustrative); `t.Toolbar`/`t.getListParams` are real bound members/methods.

## Choosing a tier

The table/CRUD capability comes in four tiers, each narrower in applicability and freer in control than the one above. The principle is "just enough" — don't drop a tier because a lower one exists.

| Your situation | Tier |
|---|---|
| Standard ABP backend CRUD page (including pure list pages and route-jump pages) | `useAbpTable` (+ `useAbpSheet` when create/edit is needed) |
| Data source outside `createCrudService`, but still wanting ABP-style assembly (permission gating/row actions/error states/page clamping) | `useAbpTable` with a `(params) => AbpTableSource` callback; reference at [`books/-tiers/books-l1-demo.tsx`](../../examples/starter/src/routes/_layout/_authed/books/-tiers/books-l1-demo.tsx) |
| A generic non-ABP table (no paging protocol assumptions) | L2: `useDataTableState` + `useDataTable` + `<DataTable table={dt}>`; reference at [`books/-tiers/books-l2-demo.tsx`](../../examples/starter/src/routes/_layout/_authed/books/-tiers/books-l2-demo.tsx) |
| Changing the assembly itself (rearranging the "···" menu chrome, the bulk bar layout, the toolbar structure) | Fork the corresponding assembly file (`abp-table.tsx`/`abp-query-form.tsx`/`abp-bulk-bar.tsx`/`row-actions-menu.tsx`…) — under copy-in distribution that is legitimate use |

The `useAbpPage`/`useAbpCrud`/`useCrud`/`QueryField`/`QueryRange`/`tableRef`/`render*` callback families are all retired and no longer appear in page code. The `books` page lays the first three tiers side by side as tabs (`Tabs` in `index.tsx`) for direct comparison.

**Custom data sources (the `source` callback)**: `useAbpTable`'s first parameter is either a `createCrudService` product or a `(params: ListParams) => AbpTableSource<TDto>` callback; the callback may call other hooks unconditionally — the kind (service / callback) must not switch across renders within one `useAbpTable` call's lifetime, which is no problem in practice since a caller only ever passes one kind. The `AbpTableSource<TDto>` shape the callback must produce:

```ts
export interface AbpTableSource<TDto> {
  listQuery: { data?: PagedResult<TDto>; isPending: boolean; isFetching: boolean; isError: boolean; refetch?: () => void };
  pageCount: number;
  totalCount: number;
  delete?: { mutate: (id: string) => void };   // absent on read-only sources
  can: { create: boolean; update: boolean; delete: boolean };
  supportsFilter: boolean;
}
```

The `books-l1-demo.tsx` form:

```tsx
const t = useAbpTable<AbpSwaggerBooksBookDto>(
  (params) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: the source-callback kind never switches across renders; branch lifetime is stable
    const listQuery = useGetApiAppBook(params, {
      query: { placeholderData: keepPreviousData, select: toPagedResult },
    });
    const totalCount = listQuery.data?.totalCount ?? 0;
    return {
      listQuery: {
        data: listQuery.data,
        isPending: listQuery.isPending,
        isFetching: listQuery.isFetching,
        isError: listQuery.isError,
        refetch: () => void listQuery.refetch(),
      },
      pageCount: Math.max(Math.ceil(totalCount / params.MaxResultCount), 1),
      totalCount,
      delete: { mutate: (id: string) => deleteBook.mutate({ id }) },
      can: { create: false, update: false, delete: true },
      supportsFilter: false,
    };
  },
  { columns },
);

return <t.Table />;
```

**The L2 generic table** (non-ABP data source, `books-l2-demo.tsx`):

```tsx
const state = useDataTableState();
const listQuery = useGetApiAppBook(toAbpListParams(state.params), {
  query: { placeholderData: keepPreviousData },
});
const dt = useDataTable({
  state,
  columns,
  data: listQuery.data?.items ?? [],
  pageCount: Math.max(Math.ceil((listQuery.data?.totalCount ?? 0) / state.pagination.pageSize), 1),
  rowCount: listQuery.data?.totalCount ?? 0,
});

return (
  <DataTable
    table={dt}
    loading={listQuery.isPending}
    fetching={listQuery.isFetching && !listQuery.isPending}
  />
);
```

L2 deliberately keeps the community-idiomatic "pass the instance explicitly" shape (`table={dt}`) instead of bound members — the escape tier's audience assembles from the instance anyway, and the loose parts (`DataTableToolbar`/`DataTableColumnsMenu`/`DataTableSortMenu`) each take an explicit `table` prop.

## Built-in behavior (not your concern, but know it exists)

These invariants are maintained inside the framework; page code neither needs to nor should reimplement them:

- **Error states keep the query area/search box**, with a same-params Retry button (transient errors — network blips, 500s — retry with unchanged params; input-triggered 400s take the change-the-params path; the two don't interfere).
- **Page clamping after emptying the last page**: deleting the current page empty steps the page number back to the new last page instead of parking on an out-of-range empty one; applies only once fetching settles (not pending/fetching/error).
- **Bulk delete built in**: `t.BulkDelete` (inside `t.BulkBar`) with confirmation, serial deletion, three-branch result messaging, and failure backfill — zero wiring; renders `null` without delete permission.
- **Selection pruning after deletes**: rows removed by deletion or data changes are cleaned out of `rowSelection` automatically — no ghost bulk bar showing "0 selected".
- **Filter/sort/search changes reset to page 1 and clear the selection.**
- **`concurrencyStamp` round-trips automatically**: the sheet reads it off the row record and attaches it to update requests; your `toUpdate` never assembles it.
- **Server validation errors land on their fields automatically**: via `abpSubmitValidator`, rendered through the same chain as client zod validation.

## Menu items + messages

### `menu.tsx`

`src/menu.tsx`'s `menuItems: MenuItem<FileRouteTypes["to"]>[]` is a purely declarative array; the `to` field's type comes from `@/routeTree.gen`'s path union, so deleted/renamed routes surface menu dead links at compile time; `buildMenu` prunes by `requiredPolicy`. Adding a leaf:

```tsx
import { Book } from "lucide-react";

{ key: "books", label: "App::Books", to: "/books", icon: <Book /> }
```

Entities protected by a policy carry `requiredPolicy`, matching the route's `beforeLoad` policy name:

```tsx
{
  key: "identity-users",
  label: "AbpIdentity::Users",
  to: "/identity/users",
  icon: <Users />,
  requiredPolicy: IdentityPermissions.Users.Default,
}
```

### Messages

**Convention**: entries you add yourself go into `src/i18n/<culture>.json` (e.g. `src/i18n/en.json`, `src/i18n/zh-Hans.json`), under the **`"App"` bucket**:

```json
{
  "App": {
    "Books": "Books",
    "BookName": "Name",
    "BookNameRequired": "Name is required"
  }
}
```

Pages read them with `L("App::BookName")`. In `__root.tsx` this JSON deep-merges (`mergeCatalogs(...)`) with each block's `*-messages.json` into `AppConfigProvider`'s `messages` — already wired by `jc-abp init`; new pages **never touch `__root.tsx`**, just add keys to the `App` bucket.

If a field uses an ABP built-in resource entry (say `AbpIdentity::UserName`), use that resource bucket directly — don't copy it into `App`, or backend localization changes will fight your hardcoded copy.

## Common traps

1. **A remote combobox without a `Filter` endpoint degrades to client-side filtering — don't fabricate server params**. Check the related entity's `Get...Params` type (the same method as judging `supportsFilter` in step ②) — no `Filter` field means the backend can't search by keyword, so `loadOptions` should fetch a fixed batch (say the first 20) and substring-filter on the client:

   ```ts
   async function loadAuthorOptions(search: string): Promise<ComboboxOption[]> {
     const result = await getApiAppAuthor({ SkipCount: 0, MaxResultCount: AUTHOR_PAGE_SIZE });
     const items = result.items ?? [];
     const query = search.trim().toLowerCase();
     const filtered = query ? items.filter((a) => (a.name ?? "").toLowerCase().includes(query)) : items;
     return filtered.map((a) => ({ value: a.id ?? "", label: a.name ?? "" }));
   }
   ```

2. **Give each new page one component-level CRUD-flow smoke test**. Unit tests can't catch seam defects of the "third-party runtime × real Web APIs × multi-step user sequences" kind. You don't need one per entity from scratch — follow the pattern of [`examples/starter/test/crud-flow.test.tsx`](../../examples/starter/test/crud-flow.test.tsx) (`createCrudService` + `useAbpSheet` + `useAbpTable` combined, an in-memory mock service, running the open→reopen, field-error→edit→resubmit, and delete→204→invalidate sequences) and clone it onto your entity.

3. **A pure create page can exist without `useAbpSheet`**: [`books/new.tsx`](../../examples/starter/src/routes/_layout/_authed/books/new.tsx) is the long-form escape hatch — no drawer, just `useAppForm(abpFormOptions({...}))` on a standalone page. Such pages never "open an existing record for backfill" and are untouched by any form-side reset timing details.

## Complete references

- [`examples/starter/src/routes/_layout/_authed/books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) — every snippet here comes from it; L0/L1/L2 tier tabs, no policy, a minimal complete sample with a remote combobox.
- [`examples/starter/src/routes/_layout/_authed/identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx) — the advanced sample: policy-protected (`beforeLoad` + `policy`), create-only password field, `MultiCombobox`, async related-data prefetch, `lazy`-loaded permission panel.
- [`examples/starter/src/routes/_layout/_authed/identity/roles.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/roles.tsx) — the simpler sample: no remote combobox, `row.menu` adding a permission panel entry.
- [`examples/starter/src/routes/_layout/_authed/tenants/index.tsx`](../../examples/starter/src/routes/_layout/_authed/tenants/index.tsx) — asymmetric create/update field sets, explicit `toUpdate` against field leakage (type-level omission is legal; it's a business/security choice, not compiler-forced).
