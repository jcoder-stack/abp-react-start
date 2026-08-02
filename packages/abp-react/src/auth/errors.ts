export type AuthErrorCode =
  /** 调用方给策略喂了它不受理的输入。属于编程错误，不该当成用户可修复的失败渲染。 */
  | "invalid_input"
  | "invalid_state"
  /** 握手密文超过服务端允许的寿命。 */
  | "handshake_expired"
  | "invalid_nonce"
  | "exchange_failed"
  | "invalid_credentials"
  | "provider_denied"
  | "refresh_failed"
  | "session_open_failed"
  | "discovery_failed";

/** 策略/会话层唯一的错误类型；适配层按 code 映射为 302 ?error= 或 { ok:false, error }。 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string, opts?: { cause?: unknown }) {
    super(message ?? code, opts);
    this.name = "AuthError";
    this.code = code;
  }
}
