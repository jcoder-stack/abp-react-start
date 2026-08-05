import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface CatchProps {
  children: ReactNode;
  renderFallback: (error: Error, reset: () => void) => ReactNode;
}

interface CatchState {
  error: Error | null;
}

// 渲染错误只有 class 的 getDerivedStateFromError 能接,函数组件做不到;对外只暴露下面的函数组件。
class Catch extends Component<CatchProps, CatchState> {
  state: CatchState = { error: null };

  static getDerivedStateFromError(error: unknown): CatchState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return this.props.renderFallback(this.state.error, () => this.setState({ error: null }));
  }
}

export interface SectionBoundaryProps {
  children: ReactNode;
  /** 替换内置 fallback;接到错误对象与 reset(调用后清除错误、重渲染 children)。 */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

/**
 * 区块级错误边界:包住页面里的一个区块,渲染抛错时只有该区块被 fallback 替换,兄弟区块与
 * 页面骨架照常;错误在这里被接住,不再冒泡到路由层的 errorComponent。默认 fallback 是
 * 词条化的紧凑错误条 + 重试按钮(重试即重渲染 children,适合瞬时性数据错误)。
 */
export function SectionBoundary({ children, fallback }: SectionBoundaryProps) {
  const L = useLocalization();
  return (
    <Catch
      renderFallback={(error, reset) =>
        fallback ? (
          fallback(error, reset)
        ) : (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm"
          >
            <p className="font-medium text-destructive">{L("Shell:UnexpectedError")}</p>
            <p className="mt-1 text-muted-foreground">{error.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={reset}>
              {L("Shell:Retry")}
            </Button>
          </div>
        )
      }
    >
      {children}
    </Catch>
  );
}
