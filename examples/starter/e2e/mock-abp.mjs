// 根路由每次 SSR 都要取 application-configuration；e2e 只需要匿名能渲染出页面，别的接口一律 404。
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
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`mock ABP on http://127.0.0.1:${port}`));
