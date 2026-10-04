// 根路由每次 SSR 都要取 application-configuration；e2e 只需要匿名能渲染出页面。
// 另有两个文件端点供流式下载用例：分两块、中间停顿的附件，和一个 403 错误信封。其余接口一律 404。
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_ABP_PORT ?? 44399);
const config = readFileSync(new URL("./app-configuration.json", import.meta.url));

createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/api/abp/application-configuration")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(config);
    return;
  }
  if (req.method === "GET" && req.url === "/api/app/e2e-file/download") {
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": "attachment; filename*=UTF-8''%E5%91%98%E5%B7%A5.bin",
    });
    // 停顿让「首块先于末块到达浏览器」可观测：中间任何一层整份缓冲，两块就会同时到。
    res.write(Buffer.from([0x00, 0xff, 0x10]));
    setTimeout(() => res.end(Buffer.from([0x20, 0x30])), 1500);
    return;
  }
  if (req.method === "GET" && req.url === "/api/app/e2e-file/forbidden") {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "没有权限" } }));
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`mock ABP on http://127.0.0.1:${port}`));
