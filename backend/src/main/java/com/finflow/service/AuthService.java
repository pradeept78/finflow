package com.finflow.service;

import com.finflow.dto.request.LoginRequest;
import com.finflow.dto.request.RegisterRequest;
import com.finflow.dto.response.AuthResponse;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import com.finflow.security.JwtService;
import com.finflow.security.LoginAttemptService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final LoginAttemptService loginAttempts;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            // Was "Email already registered" — told an attacker, via the response body alone,
            // exactly which email addresses already have an account here (enumeration). The login
            // path already avoids this with a generic "Invalid credentials"; match that here.
            throw new RuntimeException("Could not create account with the details provided");
        }
        // User.role now carries @Builder.Default, so leaving .role(...) off here correctly gets
        // "USER" rather than null — see User.java for why that annotation is the part that matters.
        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .build();
        userRepository.save(user);
        // getRoleOrDefault(), not getRole(): Spring Security's UserDetails.builder().roles(...)
        // throws NullPointerException on a null role, which used to turn "row saved successfully"
        // into an uncaught exception a few lines later — the account existed in the database but
        // register() still reported failure to the caller.
        var userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail()).password(user.getPassword()).roles(user.getRoleOrDefault()).build();
        String token = jwtService.generateToken(userDetails);
        return AuthResponse.builder().token(token).userId(user.getId())
                .name(user.getName()).email(user.getEmail()).role(user.getRoleOrDefault()).build();
    }

    public AuthResponse login(LoginRequest request) {
        // Checked before the password, so a locked email is refused even with the right one.
        loginAttempts.checkAllowed(request.getEmail());
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (AuthenticationException e) {
            loginAttempts.recordFailure(request.getEmail());
            throw e;
        }
        loginAttempts.recordSuccess(request.getEmail());
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));
        // Same getRoleOrDefault() reasoning as register() above: a role=NULL row that predates the
        // @Builder.Default fix must still be able to log in, not NPE here every time.
        var userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail()).password(user.getPassword()).roles(user.getRoleOrDefault()).build();
        String token = jwtService.generateToken(userDetails);
        user.setLastLogin(java.time.LocalDateTime.now());
        // Self-heal a legacy role=NULL row on its next successful login: AdminController reads
        // `u.getRole()` directly for its user list, so a fallback applied only in this response
        // would still show that account's row as blank there forever. Writing it back here means
        // no manual SQL backfill is needed for any account created before the @Builder.Default fix.
        if (user.getRole() == null || user.getRole().isBlank()) {
            user.setRole("USER");
        }
        userRepository.save(user);
        return AuthResponse.builder().token(token).userId(user.getId())
                .name(user.getName()).email(user.getEmail()).role(user.getRoleOrDefault()).build();
    }
}
