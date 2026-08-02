import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";
import { type ApplicationConfiguration, isAbpTrue } from "../core";
import {
  createTranslator,
  type FrontendCatalog,
  type Translator,
  type TranslatorOptions,
} from "../i18n";

interface AppConfigValue {
  config: ApplicationConfiguration;
  translator: Translator;
}

const AppConfigContext = createContext<AppConfigValue | null>(null);

export interface AppConfigProviderProps {
  config: ApplicationConfiguration;
  messages?: FrontendCatalog;
  fallbackCulture?: string;
  /** 缺 key 回调；始终读最新一次传入的实现，可安全写成内联箭头函数。 */
  onMissingKey?: (key: string) => void;
  /** translator 工厂注入点（如换 ICU 引擎）；只在 translator 重建时读取，不必引用稳定。 */
  createTranslator?: (opts: TranslatorOptions) => Translator;
  children: ReactNode;
}

/** app-config（localization/settings/features）Provider；auth 相关内容走 SessionProvider。 */
export function AppConfigProvider(props: AppConfigProviderProps): ReactNode {
  const { config, messages, fallbackCulture, children } = props;
  // 两个回调 props 通常写成内联箭头函数。放进依赖数组会让 translator 与 context value 每次渲染
  // 重建，全部消费者陪跑，所以经 ref 读取，重建只由数据来源（config/messages/fallbackCulture）驱动。
  const callbacksRef = useRef(props);
  callbacksRef.current = props;
  const value = useMemo<AppConfigValue>(() => {
    const makeTranslator = callbacksRef.current.createTranslator ?? createTranslator;
    return {
      config,
      translator: makeTranslator({
        culture: config.localization.currentCulture.name,
        backend: config.localization.values,
        frontend: messages,
        fallbackCulture,
        defaultResourceName: config.localization.defaultResourceName ?? undefined,
        onMissing: (key) => callbacksRef.current.onMissingKey?.(key),
      }),
    };
  }, [config, messages, fallbackCulture]);
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

function useAppConfigContext(): AppConfigValue {
  const ctx = useContext(AppConfigContext);
  if (ctx === null) throw new Error("useAppConfig* hooks must be used within <AppConfigProvider>");
  return ctx;
}

/** 解析后的 ABP application-configuration。 */
export function useAppConfig(): ApplicationConfiguration {
  return useAppConfigContext().config;
}

/** 可调用的本地化助手：L(key, ...args)、L.plural、L.has。 */
export interface Localize {
  (key: string, ...args: unknown[]): string;
  plural(key: string, count: number, ...args: unknown[]): string;
  has(key: string): boolean;
}

export function useLocalization(): Localize {
  const { translator } = useAppConfigContext();
  return useMemo(() => {
    const L = ((key: string, ...args: unknown[]) => translator.t(key, ...args)) as Localize;
    L.plural = (key, count, ...args) => translator.plural(key, count, ...args);
    L.has = (key) => translator.has(key);
    return L;
  }, [translator]);
}

/** 当前 culture 名（如 "en"、"zh-Hans"）。 */
export function useCulture(): string {
  return useAppConfigContext().config.localization.currentCulture.name;
}

export function useSetting(name: string): string | undefined {
  return useAppConfigContext().config.setting.values[name];
}

export function useSettingBoolean(name: string): boolean {
  return isAbpTrue(useSetting(name));
}

export function useFeature(name: string): string | undefined {
  return useAppConfigContext().config.features.values[name];
}

export function useFeatureEnabled(name: string): boolean {
  return isAbpTrue(useFeature(name));
}

export interface FeatureGuardProps {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
}

/** ABP feature 开启时渲染 children，否则 fallback（默认 null）。 */
export function FeatureGuard(props: FeatureGuardProps): ReactNode {
  const { feature, fallback = null, children } = props;
  return useFeatureEnabled(feature) ? children : fallback;
}
