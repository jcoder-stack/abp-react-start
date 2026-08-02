// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { memo, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Identity } from "../../src/auth";
import { SessionProvider, useSession } from "../../src/react/session";

/**
 * Context value 引用稳定是项目红线：一处不稳定会让该 context 的全部消费者随父级渲染陪跑。
 * 这里用 memo 包裹的消费者计渲染次数，只有 context value 换了引用它才会重渲染。
 * AppConfigProvider 的同一红线由 app-config.test.tsx 用更严的输入（内联回调每次换引用）覆盖。
 */

const identity: Identity = {
  isAuthenticated: true,
  user: { id: "1", userName: "admin", roles: [] },
  grantedPolicies: { "AbpIdentity.Users": true },
  tenant: null,
};

function countingConsumer(subscribe: () => void) {
  const counter = { renders: 0 };
  const Consumer = memo(function Consumer() {
    counter.renders += 1;
    subscribe();
    return null;
  });
  return { counter, Consumer };
}

function expectStableAcrossRerenders(counter: { renders: number }, tree: () => ReactNode) {
  const { rerender } = render(tree());
  expect(counter.renders).toBe(1);
  rerender(tree());
  rerender(tree());
  expect(counter.renders).toBe(1);
}

describe("provider context value identity", () => {
  it("SessionProvider keeps its value across re-renders with the same props", () => {
    const { counter, Consumer } = countingConsumer(() => {
      useSession();
    });
    expectStableAcrossRerenders(counter, () => (
      <SessionProvider identity={identity}>
        <Consumer />
      </SessionProvider>
    ));
  });
});
