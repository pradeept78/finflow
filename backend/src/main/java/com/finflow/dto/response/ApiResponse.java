package com.finflow.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Standard response envelope every controller wraps its payload in. This file was referenced by
 * ~18 controllers (LoanController, SnapshotController, AdminController, GlobalExceptionHandler,
 * etc.) but never actually existed on disk, so `mvn compile` failed the moment any of them were
 * touched — unrelated to the Statement Analyzer merge, just a pre-existing gap this build finally
 * surfaced.
 *
 * Shape and static factories were reverse-engineered from every call site in the codebase:
 *   - ApiResponse.ok(data)              -> success response, no message
 *   - ApiResponse.ok("message", data)   -> success response with a message
 *   - ApiResponse.error("message")      -> failure response, data left null
 *   - ApiResponse.<T>builder()...build() -> used directly in GlobalExceptionHandler's validation
 *     handler to attach a Map<String,String> of field errors.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private T data;

    public static <T> ApiResponse<T> ok(T data) {
        return ApiResponse.<T>builder().success(true).data(data).build();
    }

    public static <T> ApiResponse<T> ok(String message, T data) {
        return ApiResponse.<T>builder().success(true).message(message).data(data).build();
    }

    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder().success(false).message(message).build();
    }
}
