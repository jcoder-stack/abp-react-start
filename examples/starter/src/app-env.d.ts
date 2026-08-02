declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_TITLE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace NodeJS {
    interface ProcessEnv {
      readonly OIDC_ISSUER: string;
      readonly OIDC_CLIENT_ID: string;
      readonly OIDC_CLIENT_SECRET?: string;
      readonly OIDC_SCOPE?: string;
      readonly API_BASE_URL: string;
      readonly AUTH_SESSION_SECRET: string;
      readonly OIDC_REDIRECT_URI: string;
      readonly OIDC_POST_LOGOUT_REDIRECT_URI?: string;
    }
  }
}

export {};
