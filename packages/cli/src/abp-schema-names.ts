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

function applyRenames<T>(doc: T, rename: Map<string, string>): T {
  const root = doc as { components?: { schemas?: Record<string, unknown> } };
  const schemas = root.components?.schemas;
  if (schemas === undefined || rename.size === 0) {
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

function schemaKeys(doc: unknown): string[] {
  const schemas = (doc as { components?: { schemas?: Record<string, unknown> } }).components
    ?.schemas;
  return schemas === undefined ? [] : Object.keys(schemas);
}

/** orval input transformer: rename ABP's verbose .NET generic schema ids to short readable names and rewrite every $ref accordingly. Non-generic schemas and unresolved names are left as-is; a name collision keeps the original id. */
export function simplifyAbpGenericSchemaNames<T>(doc: T): T {
  const keys = schemaKeys(doc);
  const rename = new Map<string, string>();
  const taken = new Set(keys);
  for (const key of keys) {
    const short = shortenAbpGenericName(key);
    if (short === undefined || short === key || taken.has(short)) {
      continue;
    }
    rename.set(key, short);
    taken.add(short);
  }
  return applyRenames(doc, rename);
}

/** orval input transformer: shorten every schema id to its type name — generics as in
 *  simplifyAbpGenericSchemaNames, the rest by dropping the .NET namespace
 *  (`Volo.Abp.Identity.IdentityRoleDto` → `IdentityRoleDto`) — and rewrite every $ref.
 *  A short name claimed by more than one schema is given to none of them: all keep their full id,
 *  so which one "wins" never depends on declaration order. */
export function shortenAbpSchemaNames<T>(doc: T): T {
  const keys = schemaKeys(doc);
  const shortOf = new Map<string, string>();
  const claims = new Map<string, number>();
  for (const key of keys) {
    const short = key.includes("`") ? (shortenAbpGenericName(key) ?? key) : key.split(".").pop();
    const name = short === undefined || short === "" ? key : short;
    shortOf.set(key, name);
    claims.set(name, (claims.get(name) ?? 0) + 1);
  }
  const rename = new Map<string, string>();
  for (const [key, name] of shortOf) {
    if (name !== key && claims.get(name) === 1) {
      rename.set(key, name);
    }
  }
  return applyRenames(doc, rename);
}
