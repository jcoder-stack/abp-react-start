import { useAppConfig, useLocalization, useSession } from "@jcoder/abp-react/react";
import { useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** ABP 惯例租户切换框：输入租户名经 /api/tenant 302 落 cookie；留空切回宿主；多租户不可用时不渲染。 */
export function TenantSwitcher() {
  const { currentTenant } = useAppConfig();
  const { identity } = useSession();
  const L = useLocalization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [name, setName] = useState(identity.tenant?.name ?? "");
  if (!currentTenant.isAvailable) return null;

  const currentLabel = identity.tenant?.name ?? L("Layout:Host");
  const confirm = () => {
    const tenant = name.trim();
    const query =
      tenant === ""
        ? `returnUrl=${encodeURIComponent(pathname)}`
        : `tenant=${encodeURIComponent(tenant)}&returnUrl=${encodeURIComponent(pathname)}`;
    window.location.assign(`/api/tenant?${query}`);
  };

  // 触发器无 aria-label：可见文本（当前租户/宿主）就是可及名，覆盖它会破坏测试与读屏
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Building2 />
          <span className="hidden md:inline">{currentLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{L("Layout:SwitchTenant")}</DialogTitle>
          <DialogDescription>{L("Layout:TenantSwitchHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="tenant-name">{L("Layout:TenantName")}</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && confirm()}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{L("Layout:Cancel")}</Button>
          </DialogClose>
          <Button onClick={confirm}>{L("Layout:Confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
