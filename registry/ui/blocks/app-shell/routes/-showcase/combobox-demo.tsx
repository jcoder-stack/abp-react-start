import { useLocalization } from "@jcoder/abp-react/react";
import { useMemo, useState } from "react";
import { Combobox } from "@/components/combobox/combobox";
import { MultiCombobox } from "@/components/combobox/multi-combobox";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";

function buildOptions(L: (key: string) => string): ComboboxOption[] {
  return [
    { value: "admin", label: L("Showcase:OptAdmin") },
    { value: "editor", label: L("Showcase:OptEditor") },
    { value: "viewer", label: L("Showcase:OptViewer") },
    { value: "auditor", label: L("Showcase:OptAuditor") },
    { value: "developer", label: L("Showcase:OptDeveloper") },
    { value: "operator", label: L("Showcase:OptOperator") },
  ];
}

/** combobox 展示：只传 `options`（不传 `loadOptions`）= 纯本地过滤，不发网络。单选/多选并列，输入即筛选，选中项 label 自动回显。 */
export function ComboboxDemo() {
  const L = useLocalization();
  const options = useMemo(() => buildOptions(L), [L]);
  const [single, setSingle] = useState<string>();
  const [multi, setMulti] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {L("Showcase:ComboboxSingle")}
        </span>
        <Combobox value={single} onChange={setSingle} options={options} />
      </div>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {L("Showcase:ComboboxMulti")}
        </span>
        <MultiCombobox values={multi} onChange={setMulti} options={options} />
      </div>
    </div>
  );
}
