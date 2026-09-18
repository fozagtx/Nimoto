import type { StatusCode } from 'hono/utils/http-status';

export class ApiError extends Error {
  constructor(
    readonly status: StatusCode,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(
    code = 'unauthorized',
    message = 'Authentication required',
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(401, code, message, details);
  }

  static forbidden(code = 'forbidden', message = 'Not allowed'): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(code = 'not_found', message = 'Not found'): ApiError {
    return new ApiError(404, code, message);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(409, code, message, details);
  }

  static tooManyRequests(message = 'Slow down a moment'): ApiError {
    return new ApiError(429, 'rate_limited', message);
  }

  static internal(code = 'internal_error', message = 'Something went wrong'): ApiError {
    return new ApiError(500, code, message);
  }
}
