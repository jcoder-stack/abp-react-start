// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoloAbpAccountUpdateProfileDto } from "@/api/models";
import { configureAbpMutator, resetAbpMutator } from "@/api/mutator";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { Route } from "@/routes/_layout/_authed/profile/index";
import { renderWithProviders } from "./test-utils";

// 渲染真实的 profile 页面（Route.options.component 就是 index.tsx 的 ProfilePage）。取数与写入
// 都不 mock 到 hook 层：只把 abpMutator 的 fetchFn 换成一个记账的假后端，页面用的
// useGetApiAccountMyProfile / putApiAccountMyProfile / setQueryData 全是真件，「保存后表单换上
// 新 stamp」这条契约同时经由 form.reset 与查询缓存回流两条路，任一条被 mock 掉都测不出真话。
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const messages = {
  en: { "": { ...formMessages.en[""], ...crudMessages.en[""] } },
  "zh-Hans": { "": { ...formMessages["zh-Hans"][""], ...crudMessages["zh-Hans"][""] } },
};

const PROFILE_URL = "/api/account/my-profile";

/** 假后端：像 ABP 那样每次 UpdateAsync 都换一枚新 stamp，并记下每次 PUT 的 body 供断言。 */
function startFakeBackend() {
  const putBodies: VoloAbpAccountUpdateProfileDto[] = [];
  let stamp = "stamp-1";
  const profile = () => ({
    userName: "alice",
    email: "alice@abp.io",
    concurrencyStamp: stamp,
  });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  configureAbpMutator({
    fetchFn: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === PROFILE_URL && method === "GET") return json(profile());
      if (url === PROFILE_URL && method === "PUT") {
        putBodies.push(JSON.parse(String(init?.body)) as VoloAbpAccountUpdateProfileDto);
        stamp = `stamp-${putBodies.length + 1}`;
        return json(profile());
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    },
  });

  return putBodies;
}

/** 资料卡与改密卡各有一个「保存」按钮，按 userName 字段所属的 <form> 定位到资料卡这一个。 */
function profileForm(): HTMLFormElement {
  const userName = screen.getByRole("textbox", { name: /UserName/ });
  const form = userName.closest("form");
  if (!form) throw new Error("userName field is not inside a form");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  resetAbpMutator();
});

describe("profile page: concurrencyStamp round-trip", () => {
  it("sends the GET stamp on the first save and the PUT response's stamp on the second", async () => {
    const putBodies = startFakeBackend();
    const ProfilePage = Route.options.component;
    if (!ProfilePage) throw new Error("profile route has no component");
    renderWithProviders(<ProfilePage />, { messages });

    await screen.findByRole("textbox", { name: /UserName/ });
    fireEvent.click(within(profileForm()).getByRole("button", { name: "Save" }));

    // onSuccess 排在 submit 之后，toast 到位即证明 submit 里 await PUT 之后的
    // setQueryData + form.reset 已经落地，只等 putBodies 变长只能证明请求发出去了。
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    fireEvent.click(within(profileForm()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));

    // 第二次带的是 stamp-2 而非 stamp-1：GET 的 stamp 进了首次 payload，PUT 响应的新 stamp
    // 又被续回表单。少了后半截，真实用户连按两次保存就会撞 AbpDbConcurrencyException。
    expect(putBodies.map((body) => body.concurrencyStamp)).toEqual(["stamp-1", "stamp-2"]);
  });
});
