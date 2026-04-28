export const ErrorCode = {
    // File system
    NOT_FOUND: 'NOT_FOUND',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NOT_A_DIRECTORY: 'NOT_A_DIRECTORY',
    DESTINATION_NOT_FOUND: 'DESTINATION_NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',

    // Request validation
    INVALID_REQUEST: 'INVALID_REQUEST',

    // Internal
    INTERNAL: 'INTERNAL',

    // Session
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface ErrorInfo {
    code: ErrorCode
    message: string
}
