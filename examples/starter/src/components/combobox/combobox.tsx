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
  for (const option of resolvedOptions) cacheRef.current.set(option.value, option);

  // value 由外部（受控）变化时，把该值已知的 label 同步进搜索框文本，让关闭态的输入框显示选中项。
  useEffect(() => {
    if (value === undefined) return;
    const cached = cacheRef.current.get(value);
    if (cached && typeof cached.label === "string") setSearch(cached.label);
    // setSearch 是 useState setter，引用稳定；只想在受控 value 变化时同步，search/cache 不应触发。
  }, [value, setSearch]);

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
      <ComboboxInput placeholder={placeholder ?? L("Combobox:Placeholder")} disabled={disabled} />
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
