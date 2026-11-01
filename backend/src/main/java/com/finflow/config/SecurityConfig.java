package com.finflow.config;

import com.finflow.repository.UserRepository;
import com.finflow.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final UserRepository userRepository;

    public SecurityConfig(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Bean
    public UserDetailsService userDetailsService() {
        // Was hardcoded .roles("USER") for every account regardless of the DB `role` column, so
        // Spring's own hasRole()/@PreAuthorize mechanisms could never work anywhere in the app —
        // /admin/** was protected ONLY by AdminController's manual requireAdmin() check, with zero
        // framework-level backstop if a future admin endpoint forgot to call it. This is loaded
        // fresh by JwtAuthFilter on every request (not cached in the token), so deriving the real
        // role here is enough to make hasRole("ADMIN") below actually mean something.
        // getRoleOrDefault(), not getRole(): a role=NULL row (any account created before User's
        // @Builder.Default fix) made .roles(null) NPE on every single authenticated request this
        // service loads for — not just login, since JwtAuthFilter re-resolves UserDetails here on
        // every call. See User.getRoleOrDefault() for why the column can be null in the first place.
        return username -> userRepository.findByEmail(username)
                .map(user -> org.springframework.security.core.userdetails.User.builder()
                        .username(user.getEmail())
                        .password(user.getPassword())
                        .roles(user.getRoleOrDefault())
                        .build())
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService());
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    // The CORS definition lives in CorsConfig — one bean, one origin list. This class used to
    // declare a second one with a different list, which is how the two drifted apart.
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthFilter jwtAuthFilter,
                                                   CorsConfigurationSource corsConfigurationSource) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/auth/**", "/api/auth/**", "/api/auth/**", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                // The iPhone Shortcut has no session: IngestController checks its personal key itself.
                .requestMatchers("/ingest/**").permitAll()
                // Defense-in-depth: AdminController.requireAdmin() already re-checks the live DB
                // role on every admin method and that stays in place, but until userDetailsService
                // above carried the real role, this matcher would have been a no-op — hasRole("USER")
                // is true for everyone since AdminController's own manual check was the only thing
                // standing between a plain user and these routes. Now it's a real second gate.
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            // No valid token on a protected path: answer 401 with a message the app reads as "session
            // ended" (axios.ts signs out on 401). Spring's default was a bare 403, so an expired or
            // revoked token left every page failing instead of returning to sign-in.
            .exceptionHandling(ex -> ex.authenticationEntryPoint((req, res, e) -> {
                res.setStatus(401);
                res.setContentType("application/json");
                res.getWriter().write("{\"success\":false,\"message\":\"Session expired. Please sign in again.\"}");
            }))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}

