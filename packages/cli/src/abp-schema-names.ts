/** Shorten a .NET assembly-qualified generic schema id (e.g. ABP's `Volo.Abp.Application.Dtos.PagedResultDto`1[[Volo.Abp.Identity.IdentityUserDto, …]]`) to a readable `PagedResultDtoOfIdentityUserDto`. Returns undefined for non-generic or nested-generic ids, which are left untouched. */
export function shortenAbpGenericName(name: string): string | undefined {
  const match = /^([\w.]+)`\d+\[\[(.+)\]\]$/.exec(name);
  if (match === null) {
    return undefined;
  }
  const container = match[1]?.split(".").pop();
  const argsBlock = match[2];
  if (container === undefined || argsBlock === undefined) {
    return undefined;
  }
  const args = argsBlock.split("],[").map((arg) => arg.split(",")[0]?.trim());
  if (args.some((arg) => arg === undefined || arg === "" || arg.includes("`"))) {
    return undefined;
  }
  return `${container}Of${args.map((arg) => arg?.split(".").pop()).join("And")}`;
}

function rewriteRefs(node: unknown, refMap: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      rewriteRefs(item, refMap);
    }
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const mapped = key === "$ref" && typeof value === "string" ? refMap.get(value) : undefined;
    if (mapped !== undefined) {
      obj[key] = mapped;
    } else {
      rewriteRefs(value, refMap);
    }
  }
}

/** orval input transformer: rename ABP's verbose .NET generic schema ids to short readable names and rewrite every $ref accordingly. Non-generic schemas and unresolved names are left as-is; a name collision keeps the original id. */
export function simplifyAbpGenericSchemaNames<T>(doc: T): T {
  const root = doc as { components?: { schemas?: Record<string, unknown> } };
  const schemas = root.components?.schemas;
  if (schemas === undefined) {
    return doc;
  }
  const rename = new Map<string, string>();
  const taken = new Set(Object.keys(schemas));
  for (const key of Object.keys(schemas)) {
    const short = shortenAbpGenericName(key);
    if (short === undefined || short === key || taken.has(short)) {
      continue;
    }
    rename.set(key, short);
    taken.add(short);
  }
  if (rename.size === 0) {
    return doc;
  }
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schemas)) {
    renamed[rename.get(key) ?? key] = value;
  }
  root.components = { ...root.components, schemas: renamed };
  const refMap = new Map<string, string>();
  for (const [oldKey, newKey] of rename) {
    refMap.set(`#/components/schemas/${oldKey}`, `#/components/schemas/${newKey}`);
  }
  rewriteRefs(doc, refMap);
  return doc;
}
