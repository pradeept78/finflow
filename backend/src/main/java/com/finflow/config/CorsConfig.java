package com.finflow.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * The single CORS definition for the app. There used to be two — a CorsFilter here and a
 * CorsConfigurationSource in SecurityConfig — with different origin lists that had already drifted
 * apart. Worse, this one was registered on "/api/**" and never matched anything: the servlet
 * context-path is already /api, and Spring strips the context path before matching, so the paths it
 * sees start at /loans. That made this class dead code while SecurityConfig quietly did the real
 * enforcement. Now there is one bean, on "/**", and SecurityConfig injects it.
 *
 * Origins are patterns rather than exact strings so a dev server on any local port works. Vite is
 * not always on 3000 — when the Docker frontend already holds it you end up on 3001, and the
 * Origin header survives the dev-server proxy (changeOrigin rewrites Host, not Origin), so Spring
 * sees the real browser origin and rejected it with a bare "Invalid CORS request".
 *
 * Override in production, where the frontend is served same-origin behind nginx and this list
 * should not include localhost at all:
 *   CORS_ALLOWED_ORIGINS=https://finflow.example.com
 */
@Configuration
public class CorsConfig {

    @Value("${app.cors.allowed-origin-patterns:http://localhost:[*],http://127.0.0.1:[*]}")
    private String allowedOriginPatterns;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> patterns = Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        CorsConfiguration config = new CorsConfiguration();
        // Patterns, not setAllowedOrigins: only the pattern variant understands the "[*]" port
        // wildcard, and only it may be combined with allowCredentials(true).
        config.setAllowedOriginPatterns(patterns);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
