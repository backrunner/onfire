/**
 * Unified Response Format
 * All API responses follow this structure for consistency
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  ret: number;
  data: T | null;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Error codes
export const ErrorCodes = {
  UNKNOWN: 1,
  VALIDATION: 100,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
} as const;

/**
 * Create a success response
 */
export const ok = <T>(data: T): ApiResponse<T> => ({
  success: true,
  ret: 0,
  data,
});

/**
 * Create an error response
 */
export const err = (ret: number, message?: string): ApiResponse<null> => ({
  success: false,
  ret,
  data: null,
  message,
});

/**
 * Wrap a response object in the unified format
 */
export const wrapResponse = (response: unknown): ApiResponse => {
  // Already wrapped
  if (
    response &&
    typeof response === 'object' &&
    'success' in response &&
    'ret' in response &&
    'data' in response
  ) {
    return response as ApiResponse;
  }

  // Raw Response object (streaming, files, etc.) - don't wrap
  if (response instanceof Response) {
    return response as unknown as ApiResponse;
  }

  // Wrap normal data
  return ok(response);
};

/**
 * Convert error to unified response
 */
export const errorToResponse = (error: unknown): { response: ApiResponse<null>; status: number } => {
  // Handle Response thrown as error
  if (error instanceof Response) {
    return {
      response: err(error.status, error.statusText || 'Request failed'),
      status: error.status,
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Check for common error patterns
    if (message.includes('Unauthorized') || message.includes('unauthorized')) {
      return { response: err(ErrorCodes.UNAUTHORIZED, message), status: 401 };
    }
    if (message.includes('Forbidden') || message.includes('forbidden') || message.includes('Permission')) {
      return { response: err(ErrorCodes.FORBIDDEN, message), status: 403 };
    }
    if (message.includes('Not found') || message.includes('not found')) {
      return { response: err(ErrorCodes.NOT_FOUND, message), status: 404 };
    }
    if (message.includes('Validation') || message.includes('Invalid')) {
      return { response: err(ErrorCodes.VALIDATION, message), status: 400 };
    }

    return { response: err(ErrorCodes.INTERNAL, message), status: 500 };
  }

  // Unknown error
  return {
    response: err(ErrorCodes.UNKNOWN, String(error)),
    status: 500,
  };
};

/**
 * Check if value is a raw Response that shouldn't be wrapped
 */
export const isRawResponse = (value: unknown): value is Response => {
  return value instanceof Response;
};
