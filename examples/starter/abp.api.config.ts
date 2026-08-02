// jc-abp gen 的目标配置：input 是你的 ABP 后端 swagger 地址，output 是生成的 API 客户端落地目录。
// 需要多个 target（如 identity + business 两个后端）时改成 `export default { targets: { ... } }` 形态，见根 README。
export default {
  // TODO: 换成你自己的 ABP 后端 swagger 地址
  input: "https://localhost:44316/swagger/v1/swagger.json",
  output: "src/api",
};
