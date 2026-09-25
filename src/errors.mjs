/** Public errors never retain raw upstream bodies, headers or original exceptions. */
export class AdapterError extends Error {
  constructor(message, { code = 'ADAPTER_ERROR', status, requestId, attempts } = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (requestId !== undefined) this.requestId = requestId;
    if (attempts !== undefined) this.attempts = attempts;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.attempts === undefined ? {} : { attempts: this.attempts }),
    };
  }
}

export function requireCondition(condition, message, code = 'VALIDATION_ERROR') {
  if (!condition) throw new AdapterError(message, { code });
}

/** Unknown exceptions can contain credentials or prompts; never serialize them. */
export function publicError(error) {
  return error instanceof AdapterError ? error.toJSON() : {
    code: 'UNEXPECTED_ERROR', message: 'Unexpected adapter failure.',
  };
}

/** Preserve safe HTTP diagnostics when decoding a successful response fails. */
export function withResponseMeta(meta, decode) {
  try { return decode(); }
  catch (error) {
    if (!(error instanceof AdapterError)) throw error;
    throw new AdapterError(error.message, { ...meta, ...error.toJSON() });
  }
}
