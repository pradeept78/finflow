package com.finflow.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Same pre-existing gap as ApiResponse/RegisterRequest: never existed on disk despite
 * AuthController/AuthService being written against it. Fields reverse-engineered from
 * AuthService.login(), which reads getEmail()/getPassword() and is called behind @Valid.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class LoginRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;
}
