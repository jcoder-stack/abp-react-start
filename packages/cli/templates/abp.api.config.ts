// jc-abp gen 的目标配置：input 是你的 ABP 后端 swagger 地址，output 是生成的 API 客户端落地目录。
// 需要多个 target（如 identity + business 两个后端）时改成 `export default { targets: { ... } }` 形态，见根 README。
// 这里没有 baseUrl：请求发往哪个地址是运行期的事，在应用启动时用 src/api/mutator.ts 的
// configureAbpMutator({ baseUrl }) 设置（starter 走 BFF 代理，留空即可）。
export default {
  // TODO: 换成你自己的 ABP 后端 swagger 地址
  input: "https://localhost:44316/swagger/v1/swagger.json",
  output: "src/api",
};
