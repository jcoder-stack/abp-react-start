# The form system: architecture and usage

Forms in this framework are a **four-layer system**, coupled between layers only through data contracts; the lower layers work on their own without ABP. Business pages only touch layer 2's `useAppForm` and the pre-bound field components.

For the task-oriented "how do I build a list + CRUD maintenance page", see [`abp-table.en.md`](./abp-table.en.md); this document is about **the form system itself**.

> English edition. 中文版见 [`forms.md`](forms.md)。

## The four layers

```
┌─ Layer 4  components/abp/crud/abp-form-errors.ts   the only layer that knows ABP
│           abpSubmitValidator / abpErrorToFieldErrors
│           (unwraps the AbpApiError envelope, PascalCase→camelCase, expands members)
│           components/abp/crud/abp-form-options.ts   the standard-recipe preset on layer 4 (pure function)
│           components/abp/sheet/use-abp-sheet.tsx    CRUD form-side wiring on layer 4 (the sheet state machine)
├─ Layer 3  components/form/server-errors.ts    the generic error contract (ABP-free)
│           the FieldErrors type + serverSubmitValidator (the mapError injection point)
│           containers such as SheetForm / FormSection / FormErrorSummary
├─ Layer 2  components/form/form-hook.tsx        the binding layer (ABP-free)
│           useAppForm + 6 pre-bound field components + FormErrors
└─ Layer 1  @tanstack/react-form                 headless
```

**Layering rules**:

- Layers 2 and 3 do not depend on ABP. ABP protocol knowledge (the error envelope shape, PascalCase member names) lives only in layer 4.
- The seam between layers is the `FieldErrors` type (`{ field?: string; message: string }[]`).
- Switching backends replaces layer 4 only: write your own `mapError: (error: unknown) => FieldErrors` and feed it to layer 3's `serverSubmitValidator` — layers 2/3 don't change by a line. The ABP flavor, `abpSubmitValidator`, is built exactly that way.

## The standard ABP form recipe: abpFormOptions

Forms talking to an ABP backend don't hand-copy the validationLogic / onSubmitAsync wiring — hand the options to the `abpFormOptions` preset (components/abp/crud/abp-form-options):

```tsx
const form = useAppForm(
  abpFormOptions({
    defaultValues: { name: "" },
    schema: mySchema,                    // zod, lands on onDynamic
    submit: (value) => postApiXxx(value), // thrown ABP errors land on fields/form automatically
    onSuccess: () => toast.success(L("Crud:Saved")),
  }),
);
```

It lays down the trio (`revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })`) and wraps submit in `abpSubmitValidator` (components/abp/crud/abp-form-errors — still usable standalone as an escape hatch). Extra validators go through the `validators` escape hatch (onChange/onBlur etc.; onDynamic/onSubmitAsync are owned by the preset). It is a pure function, not a hook — the product has exactly one form hook, `useAppForm`.

## The form side of a CRUD page: useAbpSheet

The three-state drawer form of a list page doesn't wire `useAppForm` by hand — `useAbpSheet` (components/abp/sheet/use-abp-sheet) takes `abpFormOptions` and further absorbs the sheet state machine, create/update dispatch, automatic concurrencyStamp round-tripping, and the defaultValues reset timing. The returned `sheet.form` is an already-configured `useAppForm` instance; everything below about field components, validation channels, and error placement applies to it unchanged.

How it pairs with the table side's `useAbpTable` into a full maintenance page is covered in [`abp-table.en.md`](./abp-table.en.md).

## Quick start: the standard shape of a form

What follows is the bare-mechanics form. Product pages should prefer the `abpFormOptions` preset above; the bare form is for understanding the machinery and for non-ABP backends.

Client-side validation is one zod schema, with messages through `L()` entries:

```tsx
const schema = z.object({
  name: z.string().trim().min(1, L("Form:Required")),
  email: z.string().trim().min(1, L("Form:Required")).pipe(z.email(L("Form:InvalidEmail"))),
  isActive: z.boolean(),
});
```

> Note: transforms like `z.string().trim()` affect **validation** only and never mutate the displayed value. `abpFormOptions` normalizes through the schema's transform output **before submitting**, so what reaches the backend is the trimmed value (working around TanStack Form's "validation does not write transformed values back").

Build the form with `useAppForm` — four fixed parts: `onDynamic` carries the client schema, `onSubmitAsync` wraps the mutation (server errors land automatically), `onSubmit` does the success epilogue (close panel / toast / navigate), and `revalidateLogic` sets the validation timing:

```tsx
import { useAppForm } from "@/components/form/form-hook";
import { abpSubmitValidator } from "@/components/abp/crud/abp-form-errors";
import { revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";

const form = useAppForm({
  defaultValues: formDefaults,
  validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
  validators: {
    onDynamic: schema,
    onSubmitAsync: abpSubmitValidator(async (value) => {
      await saveMutation.mutateAsync(value);
    }),
  },
  onSubmit: () => setSheet(null),
});
```

Fields are 1–3 lines each, and a misspelled `name` fails at compile time:

```tsx
<form.AppForm><form.FormErrors /></form.AppForm>

<form.AppField name="name">
  {(field) => <field.TextField label={L("...")} required disabled={readOnly} />}
</form.AppField>

<form.AppField name="isActive">
  {(field) => <field.SwitchField label={L("...")} disabled={readOnly} />}
</form.AppField>
```

The submit entry (a native `<form onSubmit>` or `SheetForm`'s `onSubmit` prop) is just `() => form.handleSubmit()` — **no** manual error-clearing call is needed anywhere.

Conditional fields (e.g. a password rendered only in create mode): the schema varies with the mode (`isCreate ? z.string().min(1, ...) : z.string()`), and the JSX renders conditionally with `{sheet?.mode === "create" && <form.AppField ...>}`. The reference is `identity/users.tsx`.

## Field component reference

All are used through `<form.AppField name="x">{(field) => <field.Xxx .../>}</form.AppField>`. Label, the required asterisk (`required`), `aria-required`, `data-invalid`, and inline error rendering are all internal to the components.

| Component | Field value type | Key props |
|---|---|---|
| `TextField` | `string` | `label`, `required?`, `type?` (text/email/password/date), `disabled?`, `placeholder?`, `autoComplete?` |
| `NumberField` | `number` | `label`, `required?`, `disabled?`, `step?`. Empty string ↔ `NaN` handled internally (clearing never silently becomes `0`) |
| `SwitchField` | `boolean` | `label`, `disabled?` (horizontal layout) |
| `SelectField` | `string` | `label`, `options: {value,label}[]`, `required?`, `disabled?`. Numeric enums convert with `Number()`/`String()` at the DTO boundary |
| `ComboboxField` | `string` | `label`, `options?`, `loadOptions?` (remote search), `placeholder?`, `required?`, `disabled?`. Empty passes `undefined`, writes back `?? ""` |
| `MultiComboboxField` | `string[]` | `label`, `options`, `editable`. `editable=false` renders read-only Badge chips; `editable=true` goes through the lazy `MultiCombobox` |

The required-field trio: pass `required` on the component (asterisk + `aria-required` built in, **never the native `required`** — it pops the browser bubble first and hides the inline error) + `.min(1, L("Form:Required"))` in the schema + `revalidateLogic`. The asterisk is purely visual; the actual gate is the schema.

## The four validation channels

| Channel | How | When |
|---|---|---|
| **Client rules** | One zod schema on `validators.onDynamic`, messages via `L("Form:*")`/business entries | With `revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })`: silent before submit, validate-on-change after a failed submit |
| **Pre-submit gate** | Built into TanStack Form: failed validation never reaches `onSubmitAsync`, no request is sent | Automatic |
| **Backend errors** | `onSubmitAsync: abpSubmitValidator(submit)` — the `AbpApiError` thrown by the mutation unwraps into `{ form, fields }`; field-level errors land on their fields, form-level ones in `FormErrors` | After submit |
| **Custom business validation** | Sync: zod `.refine()` / a cross-field form-level validator. Async (e.g. username uniqueness): field-level `onBlurAsync` + `asyncDebounceMs` against a precheck endpoint | As needed |

Client and server errors render through **the same chain** (`field.state.meta.errors → FieldError`), already wired inside the field components — pages don't notice the difference.

## Field interplay and async prechecks (listeners)

Field interplay (changing A clears B) and on-blur async uniqueness prechecks use TanStack Form's `listeners` — **naturally available**: `<form.AppField>` passes them straight through, and `abpFormOptions` owns only `onDynamic`/`onSubmitAsync`, never blocking listeners:

```tsx
<form.AppField
  name="country"
  listeners={{
    onChange: () => form.setFieldValue("province", ""),
  }}
>
  {(field) => <field.SelectField label={L("…")} options={countries} />}
</form.AppField>
```

Async uniqueness prechecks use field-level `onBlurAsync` + `asyncDebounceMs` (a debounced call to the precheck endpoint), complementing server-side validation at submit:

```tsx
<form.AppField
  name="userName"
  asyncDebounceMs={500}
  validators={{
    onBlurAsync: async ({ value }) => (await isTaken(value)) ? L("…:Taken") : undefined,
  }}
>
  {(field) => <field.TextField label={L("…")} required />}
</form.AppField>
```

## Auto-focusing the first errored field after a failed submit

After a submit finishes, `useAppForm` moves focus to the **first field still in error** (covering both failed client validation and server-injected field errors), located through the field input's `id`.

**The custom field component contract**: forward `id={field.name}` to the focusable element (the built-in `TextField` etc. already comply). Complying fields participate in the auto-focus; non-complying ones are skipped and focus moves on to the next focusable errored field — **inline errors and the `FormErrors` summary still render either way; nothing is lost**.

For accessibility, the built-in text/number/select/switch fields mark `aria-invalid` when invalid (for screen-reader announcements) — independent from focusing. `ComboboxField`/`MultiComboboxField` don't mark it yet (their `Combobox` primitive doesn't forward the attribute); that's a follow-up item.

## How server errors land

`abpSubmitValidator(submit)` packages "run the mutation + map failures into field/form-level errors" as one `onSubmitAsync` validator:

1. `submit(value)` succeeds → returns `null`, and the `onSubmit` epilogue fires.
2. `submit` throws an `AbpApiError` → `abpErrorToFieldErrors` unwraps the envelope; `validationErrors[].members` (PascalCase, e.g. `"Name"`/`"Details.Email"`) convert segment-by-segment to camelCase and land on their fields; member-less ones land form-level.
3. Nothing maps to a field error (network-class failures) → falls back to `Error.message` as a form-level error — **never swallowed silently**.

Round-tripping concurrency-control fields like `concurrencyStamp` lives in the `submit` closure (`toUpdateInput(value, record.concurrencyStamp)`), untouched by this layer. On CRUD pages using `useAbpSheet`, the stamp is injected by the hook automatically — no manual round-trip; see [`abp-table.en.md`](./abp-table.en.md).

## One constraint you must know

`useAppForm` is a **wrapper** over the native TanStack hook: on the submit path it automatically clears the errors injected by the previous round's `onSubmitAsync` (the `onSubmit` slot). This works around a deadlock in `@tanstack/react-form@1.33.2` — natively, **field-level** errors injected by `onSubmitAsync` are not cleared on "resubmit without editing the field" (the framework's cleanup branch only recognizes `cause !== 'submit'`), leaving submits permanently short-circuited by stale errors. The wrapper guards with a module-level `WeakSet` so each form instance is patched exactly once (StrictMode-safe).

**The cost, and the convention**: the `onSubmit` slot is reserved for server errors only. Therefore:

- Client validation **always goes through `validators.onDynamic`** (with `revalidateLogic`) — don't hang an `onSubmit` validator on an individual field; its errors would be cleared along with the rest on submit.
- After a major TanStack Form upgrade, re-verify the `form-hook.test.tsx` case "failed submit, no edits, resubmit → errors cleared + onSubmit fires once".

> Version facts (as of 2026-07): the latest published `@tanstack/react-form` is `1.33.2`, and the field-level submit-error non-clearing behavior has no upstream fix to replace this; the wrapper's `clearServerSubmitErrors` patch must stay. After a major upgrade, re-run the deadlock regression in `form-hook.test.tsx` as above.

## Using it against other backends, without ABP

Layers 2/3 contain no ABP. In a plain shadcn + TanStack project, `shadcn add` the form block (it depends on the combobox block — install that first), then write your own `mapError` — mapping your backend's error format into the generic `FieldErrors`, e.g. `{ errors: { email: "already taken" } }` into `[{ field: "email", message: "already taken" }]`:

```ts
import { serverSubmitValidator, type FieldErrors } from "@/components/form/server-errors";

function myMapError(error: unknown): FieldErrors {
  ...
}

const mySubmitValidator = <T,>(submit: (v: T) => Promise<void>) =>
  serverSubmitValidator(submit, myMapError);
```

Then `validators.onSubmitAsync: mySubmitValidator(submit)`, and layer 2's field components, error rendering, and validation timing all apply unchanged. ABP React Start's pitch is precisely that this `mapError` — along with CRUD, permissions, and the concurrency stamp — comes pre-built as layer 4.
