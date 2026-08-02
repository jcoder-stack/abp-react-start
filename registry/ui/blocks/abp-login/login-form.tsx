import { useLocalization } from "@jcoder/abp-react/react";
import { type FormEvent, useState } from "react";
import { loginWithPasswordFn } from "@/auth/server-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** 密码登录卡片：成功后整页跳转首页。鉴权态变化必须作废 SSR/查询缓存，整页加载是唯一可靠时机；OIDC 入口并列。 */
export function LoginForm({
  initialError,
  className,
}: {
  initialError?: string;
  className?: string;
}) {
  const L = useLocalization();
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const res = await loginWithPasswordFn({ data: { userName, password } });
      if (res.ok) {
        window.location.assign("/");
      } else {
        setError(res.error);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle>{L("Login:Title")}</CardTitle>
      </CardHeader>
      <form onSubmit={(event) => void submit(event)}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="login-username">{L("Login:UserName")}</Label>
            <Input
              id="login-username"
              autoComplete="username"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login-password">{L("Login:Password")}</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error !== undefined && (
            <Alert variant="destructive">
              <AlertDescription>
                {L("Login:Failed")}: {error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="mt-4 grid gap-2">
          <Button type="submit" disabled={pending}>
            {L("Login:Submit")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/api/auth/login">{L("Login:WithOidc")}</a>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
