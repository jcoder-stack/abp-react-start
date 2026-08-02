import { useLocalization } from "@jcoder/abp-react/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function SubmitButton({ pending, children }: { pending?: boolean; children?: ReactNode }) {
  const L = useLocalization();
  return (
    <Button type="submit" disabled={pending}>
      {pending === true && <Loader2 className="animate-spin" />}
      {children ?? L("Form:Save")}
    </Button>
  );
}
