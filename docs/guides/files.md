# 文件上传与下载

> 简体中文版。English edition: [`files.en.md`](files.en.md)

浏览器从不直连 ABP，文件也一样经服务端代理过桥，access token 始终留在服务端。上传和下载各走一条路：

| | 走哪条路 | 服务端内存 | 适合 |
| --- | --- | --- | --- |
| 上传 | 生成的 mutation → `abpUploadFn`（原生 multipart） | 整份缓冲，默认上限 10MB | 证件照、合同、Excel 导入 |
| 下载 | `downloadAbpFile` → `/api/stream/*` 流式路由 | 不缓冲，按块透传 | 任意大小 |

## 上传

ABP 里参数是 `IRemoteStreamContent`（或 DTO 里带这类属性）的接口，在 swagger 里是 `multipart/form-data`。`jc-abp gen` 生成的函数自己拼 `FormData`，直接把 `File` 传进去：

```tsx
const upload = usePostApiAppEmployeeIdAttachment();

upload.mutate({ id, data: { Category: "contract", Content: file } });
```

字段类型是 `Blob | File`，生成的 zod schema 用 `instanceof(Blob)` 校验，两者都能过。

上传正文必须能重发：遇到 401 时代理要刷新 token 再把同一份正文发一次，所以只收 `File`、`Blob`、字节和 `FormData`，不收 `ReadableStream`。

## 下载

用 `src/api/abp-download.ts` 的 `downloadAbpFile`，地址传 orval 生成的 URL 函数——后端接口改名或删除时，这里会在编译期报错：

```tsx
import { toast } from "sonner";
import { downloadAbpFile } from "@/api/abp-download";
import { getGetApiAppFileIdDownloadUrl } from "@/api/endpoints/file/file";
import { abpErrorMessage } from "@/components/abp/crud/abp-form-errors";

async function onDownload(id: string) {
  try {
    await downloadAbpFile(getGetApiAppFileIdDownloadUrl(id), {
      onProgress: ({ loaded, total }) => setPercent(total ? Math.round((loaded / total) * 100) : null),
    });
  } catch (error) {
    toast.error(abpErrorMessage(error) ?? L("Crud:OperationFailed"));
  }
}
```

- 文件名取自响应的 `Content-Disposition`（`filename*` 优先，中文名没问题）；传 `filename` 可以覆盖。
- 失败时抛的是 `AbpApiError`，和生成的 hook 一样处理。
- `onProgress` 的 `total` 可能是 `null`：上游没给长度，或者正文被压缩过，这时只能显示已下载多少。
- 只要拿到文件、不落盘（预览图片、在浏览器里解析 Excel），用 `fetchAbpFile`，它返回 `File` / `Blob`。

生成的下载函数（如 `getApiAppFileIdDownload`）也能用，返回的同样是带文件名的 `File`，但它走 server fn，正文经 base64 过桥、在服务端整份缓冲，只适合小文件。

### 流式路由做了什么

`src/routes/api.stream.$.ts` 把 `/api/stream/<ABP 路径>` 转给 ABP，带上当前会话的 token、租户和语言头，响应正文按块原样流回：

- 只挂 GET，跨站请求一律 403。
- 401 时先刷新 token 再重发——这发生在响应头之前，正文还没开始传。
- 超时只管到响应头为止：大文件下多久都行，浏览器关页或取消时上游请求随之中止。
- 响应一律 `Cache-Control: private, no-store`，带用户凭据取回的文件不进任何缓存。PWA 的 service worker 本来也不拦截 `/api/`。
- 上游不可达回 502，错误信封里只有通用消息，细节（含后端地址）只进服务端日志。
