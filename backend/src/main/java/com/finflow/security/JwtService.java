package com.finflow.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
@Slf4j
public class JwtService {

    // HS256 requires a key of at least 256 bits (32 bytes). A shorter JWT_SECRET used to pass
    // straight through startup and only fail with a WeakKeyException the first time someone
    // actually logged in and a token needed signing — the least convenient possible moment to
    // discover a misconfigured secret. Checking it once here, at construction, fails loudly and
    // immediately instead.
    private static final int MIN_SECRET_BYTES = 32;

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.expiration}")
    private long jwtExpiration;

    @PostConstruct
    private void validateSecret() {
        int bytes = secretKey.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                "JWT_SECRET is too short (" + bytes + " bytes, HS256 needs at least " + MIN_SECRET_BYTES +
                "). Generate a proper one: openssl rand -base64 48"
            );
        }
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    public String generateToken(UserDetails userDetails) {
        return generateToken(new HashMap<>(), userDetails);
    }

    public String generateToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        return buildToken(extraClaims, userDetails, jwtExpiration);
    }

    private String buildToken(Map<String, Object> extraClaims, UserDetails userDetails, long expiration) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(userDetails.getUsername())
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSignInKey())
                .compact();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }

    /**
     * True when the token was issued before the password last changed, so it must no longer work.
     * The token's issue time is whole seconds, so the change time is cut to seconds too: the fresh
     * token handed back by the password change itself (same second) stays valid.
     */
    public boolean issuedBeforePasswordChange(String token, java.time.LocalDateTime passwordChangedAt) {
        if (passwordChangedAt == null) return false;
        java.time.Instant changed = passwordChangedAt.atZone(java.time.ZoneId.systemDefault()).toInstant()
                .truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        return extractClaim(token, Claims::getIssuedAt).toInstant().isBefore(changed);
    }

    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSignInKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSignInKey() {
        byte[] keyBytes = secretKey.getBytes();
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
