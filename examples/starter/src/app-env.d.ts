declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_TITLE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  // 与 @jcoder-stack/abp-react/proxy 的 resolveAbpAuthEnv 读取的变量一一对应。
  namespace NodeJS {
    interface ProcessEnv {
      readonly AUTH_ISSUER: string;
      readonly AUTH_CLIENT_ID: string;
      readonly AUTH_CLIENT_SECRET?: string;
      readonly AUTH_SCOPE?: string;
      readonly AUTH_REDIRECT_URI: string;
      readonly AUTH_POST_LOGOUT_REDIRECT_URI?: string;
      readonly AUTH_SESSION_SECRET: string;
      readonly AUTH_ABP_BASE_URL: string;
      readonly AUTH_DEBUG?: string;
      readonly AUTH_EXTRA_CA_FILE?: string;
    }
  }
}

export {};
