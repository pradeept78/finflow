package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.dto.response.AuthResponse;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import com.finflow.security.JwtService;
import com.finflow.security.LoginAttemptService;
import com.finflow.security.PasswordRules;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * The signed-in user's own account (not analyzer.AccountController, which is bank accounts):
 * change password, delete account. Both ask for the current
 * password. A wrong one answers 400 (not 401, which the app reads as "session ended") and counts
 * towards the same lockout as sign-in, so a stolen session can't be used to guess the password.
 */
@RestController
@RequestMapping("/account")
@RequiredArgsConstructor
public class UserAccountController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final LoginAttemptService loginAttempts;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    private void confirmPassword(User user, String typed) {
        loginAttempts.checkAllowed(user.getEmail());
        if (typed == null || !passwordEncoder.matches(typed, user.getPassword())) {
            loginAttempts.recordFailure(user.getEmail());
            throw new RuntimeException("Your current password isn't right");
        }
        loginAttempts.recordSuccess(user.getEmail());
    }

    /**
     * Sets a new password and signs out every other device (tokens issued before now stop working).
     * Returns a fresh token so this device stays signed in.
     */
    @PutMapping("/password")
    public ResponseEntity<ApiResponse<AuthResponse>> changePassword(@RequestBody Map<String, String> body) {
        User user = currentUser();
        confirmPassword(user, body.get("currentPassword"));
        String next = body.get("newPassword");
        PasswordRules.check(next);
        if (passwordEncoder.matches(next, user.getPassword()))
            throw new RuntimeException("The new password must be different from the current one");
        user.setPassword(passwordEncoder.encode(next));
        user.setPasswordChangedAt(LocalDateTime.now());
        userRepository.save(user);
        var details = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail()).password(user.getPassword()).roles(user.getRoleOrDefault()).build();
        return ResponseEntity.ok(ApiResponse.ok("Password changed", AuthResponse.builder()
                .token(jwtService.generateToken(details)).userId(user.getId())
                .name(user.getName()).email(user.getEmail()).role(user.getRoleOrDefault()).build()));
    }

    /**
     * Deletes the account and everything in it. Every table that holds a user's data references
     * users(id) ON DELETE CASCADE, so the database removes it all in the same statement.
     */
    @DeleteMapping
    public ResponseEntity<ApiResponse<String>> deleteAccount(@RequestBody Map<String, String> body) {
        User user = currentUser();
        confirmPassword(user, body.get("password"));
        if ("ADMIN".equals(user.getRoleOrDefault())
                && userRepository.findAll().stream().filter(u -> "ADMIN".equals(u.getRoleOrDefault())).count() <= 1)
            throw new RuntimeException("You're the only admin. Make someone else an admin first, so FinFlow keeps one.");
        userRepository.deleteById(user.getId());
        return ResponseEntity.ok(ApiResponse.ok("Account deleted", "ok"));
    }
}
