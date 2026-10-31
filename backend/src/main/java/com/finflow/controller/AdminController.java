package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.InviteCode;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import com.finflow.service.InviteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Account administration: who has an account, roles, password resets, deleting accounts, and invite
 * codes. Deliberately NOT anyone's finances — no loans, cards, balances, totals or counts. Admins used
 * to get a full per-user money view (and every user's raw records via /users/{id}/commitments);
 * removed so an admin of a shared install sees account details only, as a money app should promise.
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final InviteService inviteService;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    private void requireAdmin() {
        User u = currentUser();
        // Was throwing a plain RuntimeException, which GlobalExceptionHandler maps to HTTP 400 —
        // an authorization failure reporting as a client-input error muddies logs/monitoring for
        // real auth failures vs validation errors. AccessDeniedException gets its own handler
        // mapped to 403, which is what this actually is.
        if (!"ADMIN".equals(u.getRole()))
            throw new org.springframework.security.access.AccessDeniedException("Admin access required");
    }

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getUsers() {
        requireAdmin();
        // The signed-in admin's id, so the UI can disable destructive actions on their own row.
        Long currentId = currentUser().getId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (User u : userRepository.findAll()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", u.getId());
            row.put("name", u.getName());
            row.put("email", u.getEmail());
            row.put("role", u.getRoleOrDefault());
            row.put("isCurrentUser", u.getId() != null && u.getId().equals(currentId));
            row.put("createdAt", u.getCreatedAt());
            row.put("lastLogin", u.getLastLogin());
            result.add(row);
        }
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<ApiResponse<String>> resetPassword(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        requireAdmin();
        String newPassword = body.get("password");
        com.finflow.security.PasswordRules.check(newPassword);
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(java.time.LocalDateTime.now());   // signs them out everywhere
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok("Password reset for " + user.getEmail(), "ok"));
    }

    private long adminCount() {
        return userRepository.findAll().stream().filter(u -> "ADMIN".equals(u.getRoleOrDefault())).count();
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<ApiResponse<String>> setRole(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        requireAdmin();
        String role = body.get("role");
        if (!List.of("USER", "ADMIN").contains(role)) throw new RuntimeException("Invalid role");
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        // Lock-out guards: an admin must not be able to demote themselves, and the last remaining
        // admin can never be demoted — otherwise nobody could reach this page again.
        if (!"ADMIN".equals(role)) {
            if (currentUser().getId().equals(id))
                throw new RuntimeException("You cannot remove your own admin access");
            if ("ADMIN".equals(user.getRoleOrDefault()) && adminCount() <= 1)
                throw new RuntimeException("At least one admin must remain");
        }
        user.setRole(role);
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok("Role updated", "ok"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<String>> deleteUser(@PathVariable Long id) {
        requireAdmin();
        User current = currentUser();
        if (current.getId().equals(id)) throw new RuntimeException("Cannot delete yourself");
        User target = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        if ("ADMIN".equals(target.getRoleOrDefault()) && adminCount() <= 1)
            throw new RuntimeException("At least one admin must remain");
        userRepository.deleteById(id);
        return ResponseEntity.ok(ApiResponse.ok("User deleted", "ok"));
    }

    @GetMapping("/me/is-admin")
    public ResponseEntity<ApiResponse<Boolean>> isAdmin() {
        User u = currentUser();
        return ResponseEntity.ok(ApiResponse.ok("ADMIN".equals(u.getRole())));
    }

    // ── Invites (see InviteService) ──

    @GetMapping("/invites")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listInvites() {
        requireAdmin();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mode", inviteService.mode());
        body.put("invites", inviteService.list());
        return ResponseEntity.ok(ApiResponse.ok(body));
    }

    @PostMapping("/invites")
    public ResponseEntity<ApiResponse<InviteCode>> createInvite(@RequestBody(required = false) Map<String, String> body) {
        requireAdmin();
        String note = body == null ? null : body.get("note");
        return ResponseEntity.ok(ApiResponse.ok("Invite created", inviteService.create(note, currentUser().getEmail())));
    }

    @DeleteMapping("/invites/{id}")
    public ResponseEntity<ApiResponse<String>> revokeInvite(@PathVariable Long id) {
        requireAdmin();
        inviteService.revoke(id);
        return ResponseEntity.ok(ApiResponse.ok("Invite revoked", "ok"));
    }
}
