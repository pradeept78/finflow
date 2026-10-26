package com.finflow.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Same pre-existing gap as ApiResponse: AuthService.register()/login() build this via
 * AuthResponse.builder().token(...).userId(...).name(...).email(...).role(...).build(), but the
 * class never existed on disk. Fields reverse-engineered from those exact builder call sites.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {
    private String token;
    private Long userId;
    private String name;
    private String email;
    private String role;
}
