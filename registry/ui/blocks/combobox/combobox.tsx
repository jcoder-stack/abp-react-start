import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useEffect, useRef } from "react";
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Combobox as ComboboxRoot,
} from "@/components/ui/combobox";
import { type ComboboxOption, useComboboxOptions } from "./use-combobox-options";

export interface ComboboxProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options?: ComboboxOption[];
  loadOptions?: (search: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  disabled?: boolean;
  /** 输入框的 id，供外部 `<Label htmlFor>` 关联与表单「首错聚焦」定位；不给则输入框不带 id。 */
  id?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

function isEqualOption(a: ComboboxOption, b: ComboboxOption): boolean {
  return a.value === b.value;
}

/** 单选 combobox：本地过滤或共享的远程 `loadOptions`（防抖 400ms），选中项 label 靠内部缓存回显。 */
export function Combobox({
  value,
  onChange,
  options,
  loadOptions,
  placeholder,
  disabled,
  id,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const L = useLocalization();
  const {
    options: resolvedOptions,
    truncatedCount,
    loading,
    search,
    setSearch,
  } = useComboboxOptions({ options, loadOptions });

  const cacheRef = useRef(new Map<string, ComboboxOption>());
  // resolvedOptions 受渲染上限截断，静态 options 要全量进缓存，否则排在上限之后的已选值回显不出 label。
  for (const option of options ?? []) cacheRef.current.set(option.value, option);
  for (const option of resolvedOptions) cacheRef.current.set(option.value, option);

  const selectedLabel = value !== undefined ? cacheRef.current.get(value)?.label : undefined;

  // 受控 value 的 label 变化（含 label 晚于 value 才得知）时同步进搜索框文本，让关闭态的输入框显示选中项。
  useEffect(() => {
    if (typeof selectedLabel === "string") setSearch(selectedLabel);
  }, [selectedLabel, setSearch]);

  const selected =
    value !== undefined ? (cacheRef.current.get(value) ?? { value, label: value }) : null;

  return (
    <ComboboxRoot
      items={resolvedOptions}
      value={selected}
      onValueChange={(next) => {
        onChange(next ? next.value : undefined);
        if (next && typeof next.label === "string") setSearch(next.label);
      }}
      inputValue={search}
      onInputValueChange={setSearch}
      isItemEqualToValue={isEqualOption}
      filter={null}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        placeholder={placeholder ?? L("Combobox:Placeholder")}
        disabled={disabled}
        // 聚焦时全选已回显的 label，首次按键即可整体替换，避免打字追加在旧文本后面。
        onFocus={(event) => event.currentTarget.select()}
      />
      <ComboboxContent>
        <ComboboxList>
          {(option: ComboboxOption) => (
            <ComboboxItem key={option.value} value={option} disabled={option.disabled}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
        {truncatedCount > 0 && (
          <div className="border-t py-1.5 text-center text-xs text-muted-foreground">
            {L("Combobox:Truncated", truncatedCount)}
          </div>
        )}
        {loading ? (
          <div className="py-2 text-center text-sm text-muted-foreground">
            {L("Combobox:Loading")}
          </div>
        ) : (
          <ComboboxEmpty>{L("Combobox:Empty")}</ComboboxEmpty>
        )}
      </ComboboxContent>
    </ComboboxRoot>
  );
}
