# File upload and download

> English edition. 简体中文版: [`files.md`](files.md)

The browser never talks to ABP directly, and files are no exception: they cross through the server-side proxy, so the access token never leaves the server. Uploads and downloads each take their own path:

| | Path | Server memory | Good for |
| --- | --- | --- | --- |
| Upload | Generated mutation → `abpUploadFn` (native multipart) | Fully buffered, 10MB cap by default | ID photos, contracts, Excel imports |
| Download | `downloadAbpFile` → the `/api/stream/*` streaming route | Not buffered, passed through chunk by chunk | Any size |

## Upload

An ABP endpoint whose parameter is `IRemoteStreamContent` (or a DTO with such a property) shows up in swagger as `multipart/form-data`. The function `jc-abp gen` generates builds the `FormData` itself; pass the `File` straight in:

```tsx
const upload = usePostApiAppEmployeeIdAttachment();

upload.mutate({ id, data: { Category: "contract", Content: file } });
```

The field is typed `Blob | File`, and the generated zod schema checks `instanceof(Blob)`, so both pass.

An upload body has to be resendable: on a 401 the proxy refreshes the token and sends the same body again. So it accepts `File`, `Blob`, bytes and `FormData`, never a `ReadableStream`.

## Download

Use `downloadAbpFile` from `src/api/abp-download.ts`, passing the URL function orval generated — if the backend renames or removes the endpoint, this fails to compile:

```tsx
import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadAbpFile } from "@/api/abp-download";
import { getGetApiAppFileIdDownloadUrl } from "@/api/endpoints/file/file";
import { abpErrorMessage } from "@/components/abp/crud/abp-form-errors";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function DownloadButton({ id, label }: { id: string; label: string }) {
  const L = useLocalization();
  // null = not downloading; undefined = downloading with an unknown total
  const [percent, setPercent] = useState<number | null | undefined>(null);

  async function onDownload() {
    setPercent(undefined);
    try {
      await downloadAbpFile(getGetApiAppFileIdDownloadUrl(id), {
        onProgress: ({ loaded, total }) =>
          setPercent(total ? Math.round((loaded / total) * 100) : undefined),
      });
    } catch (error) {
      toast.error(abpErrorMessage(error) ?? L("Crud:OperationFailed"));
    } finally {
      setPercent(null);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onDownload} disabled={percent !== null}>
        {label}
      </Button>
      {percent !== null && <Progress value={percent ?? null} aria-label={label} />}
    </div>
  );
}
```

- The filename comes from the response's `Content-Disposition` (`filename*` first, so non-ASCII names work); pass `filename` to override it.
- A failure throws `AbpApiError`, handled the same way as the generated hooks.
- `total` in `onProgress` may be `null`: the upstream sent no length, or the body was compressed. Pass `null` to `<Progress>` then: Radix marks it `data-state="indeterminate"` with no `aria-valuenow`, so screen readers don't announce a wrong percentage; visually it is an empty track, and an animation can be added in the theme layer under `[data-slot="progress"][data-state="indeterminate"]`.
- To get the file without saving it (previewing an image, parsing Excel in the browser), use `fetchAbpFile`, which returns a `File` / `Blob`.

The generated download function (e.g. `getApiAppFileIdDownload`) still works and also returns a named `File`, but it goes through a server function: the body crosses as base64 and is fully buffered on the server, so keep it for small files.

### What the streaming route does

`src/routes/api.stream.$.ts` forwards `/api/stream/<ABP path>` to ABP with the current session's token, tenant and culture headers, and streams the response body back unchanged:

- GET only; any cross-site request gets a 403.
- On a 401 it refreshes the token and resends — before the response headers, so no body has started yet.
- The timeout only covers the wait for response headers: a large file can take as long as it needs, and closing the page or cancelling aborts the upstream request too.
- Every response carries `Cache-Control: private, no-store`, so a file fetched with the user's credentials never lands in a cache. The PWA service worker does not intercept `/api/` either.
- An unreachable backend answers 502 with only a generic message in the error envelope; the details (including the backend address) go to the server log.
