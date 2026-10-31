package com.finflow.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Same pre-existing gap as ApiResponse: AuthController/AuthService were written against this
 * class (com.finflow.dto.request.RegisterRequest) but it never existed on disk. Fields and
 * validation reverse-engineered from AuthService.register(), which reads getName()/getEmail()/
 * getPassword() and is called behind @Valid.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {
    @NotBlank(message = "Name is required")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Password is required")
    // 10+ to match the sign-up form (which also asks for a letter and a number); the cap keeps a huge
    // body from reaching bcrypt. Existing accounts keep whatever password they have.
    @Size(min = 10, max = 128, message = "Password must be 10 to 128 characters")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*[0-9]).*$", message = "Password must include a letter and a number")
    private String password;
}
