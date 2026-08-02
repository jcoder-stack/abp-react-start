import { useLocalization } from "@jcoder/abp-react/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function FormErrorSummary({ errors }: { errors: string[] }) {
  const L = useLocalization();
  if (errors.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{L("Form:SubmitFailed")}</AlertTitle>
      <AlertDescription>
        {errors.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
