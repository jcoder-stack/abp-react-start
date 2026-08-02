import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useRef } from "react";
import {
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  Combobox as ComboboxRoot,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { type ComboboxOption, useComboboxOptions } from "./use-combobox-options";

export interface MultiComboboxProps {
  values: string[];
  onChange: (values: string[]) => void;
  options?: ComboboxOption[];
  loadOptions?: (search: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  disabled?: boolean;
}

function isEqualOption(a: ComboboxOption, b: ComboboxOption): boolean {
  return a.value === b.value;
}

/**
 * 多选 combobox：与单选共享同一个 `useComboboxOptions`（本地过滤或远程 `loadOptions`）。
 * 已选项 label 靠 `knownRef` 跨渲染累积缓存。远程模式下搜索词变化会替换当前结果集，
 * 但已经出现过的选项（含已选中的）label 留在缓存里，喂回 `useComboboxOptions` 的 `options`
 * 种子参数，chips 因此不会因为搜索词变化而丢失 label。
 */
export function MultiCombobox({
  values,
  onChange,
  options,
  loadOptions,
  placeholder,
  disabled,
}: MultiComboboxProps) {
  const L = useLocalization();
  const knownRef = useRef(new Map<string, ComboboxOption>());
  for (const option of options ?? []) knownRef.current.set(option.value, option);

  const seed = values
    .map((v) => knownRef.current.get(v))
    .filter((o): o is ComboboxOption => o !== undefined);

  const {
    options: resolvedOptions,
    truncatedCount,
    loading,
    search,
    setSearch,
  } = useComboboxOptions({ options: loadOptions ? seed : options, loadOptions });

  for (const option of resolvedOptions) knownRef.current.set(option.value, option);

  const selectedOptions = values.map((v) => knownRef.current.get(v) ?? { value: v, label: v });
  const anchor = useComboboxAnchor();

  return (
    <ComboboxRoot
      multiple
      items={resolvedOptions}
      value={selectedOptions}
      onValueChange={(next) => onChange(next.map((o) => o.value))}
      inputValue={search}
      onInputValueChange={setSearch}
      isItemEqualToValue={isEqualOption}
      filter={null}
      disabled={disabled}
    >
      <div ref={anchor}>
        <ComboboxChips>
          {selectedOptions.map((option) => (
            <ComboboxChip key={option.value}>{option.label}</ComboboxChip>
          ))}
          <ComboboxChipsInput
            placeholder={
              selectedOptions.length > 0 ? undefined : (placeholder ?? L("Combobox:Search"))
            }
            disabled={disabled}
          />
        </ComboboxChips>
      </div>
      <ComboboxContent anchor={anchor}>
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
