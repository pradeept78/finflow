package com.finflow.security;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Brute-force guard for /auth/login: after MAX_FAILURES wrong passwords for one email within WINDOW,
 * that email is locked for LOCK — even the right password is refused until it ends. A successful
 * login clears the count.
 *
 * Keyed by email, not IP: behind nginx and Tailscale every request arrives from the same proxy
 * address, so an IP limit would lock everyone out at once. The cost is that someone who knows your
 * email can keep it locked; that is the usual trade for a per-account limit.
 *
 * In memory: a restart clears it, and it assumes one backend instance.
 */
@Component
public class LoginAttemptService {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final Duration LOCK = Duration.ofMinutes(15);
    /** Above this many tracked emails, entries with nothing left to remember are dropped. */
    private static final int PRUNE_ABOVE = 10_000;

    private record Attempts(int failures, Instant firstFailure, Instant lockedUntil) {}

    private final Map<String, Attempts> byEmail = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginAttemptService() { this(Clock.systemUTC()); }

    LoginAttemptService(Clock clock) { this.clock = clock; }

    /** Throws TooManyAttemptsException while the email is locked. */
    public void checkAllowed(String email) {
        Attempts a = byEmail.get(key(email));
        Instant now = clock.instant();
        if (a != null && a.lockedUntil() != null && now.isBefore(a.lockedUntil())) {
            throw new TooManyAttemptsException(Duration.between(now, a.lockedUntil()));
        }
    }

    public void recordFailure(String email) {
        Instant now = clock.instant();
        byEmail.compute(key(email), (k, a) -> {
            // A lock that has ended, or failures older than the window, start a fresh count.
            if (a == null || (a.lockedUntil() != null && !now.isBefore(a.lockedUntil()))
                    || now.isAfter(a.firstFailure().plus(WINDOW))) {
                a = new Attempts(0, now, null);
            }
            int failures = a.failures() + 1;
            return new Attempts(failures, a.firstFailure(), failures >= MAX_FAILURES ? now.plus(LOCK) : null);
        });
        if (byEmail.size() > PRUNE_ABOVE) prune(now);
    }

    public void recordSuccess(String email) {
        byEmail.remove(key(email));
    }

    private void prune(Instant now) {
        byEmail.entrySet().removeIf(e -> {
            Attempts a = e.getValue();
            return a.lockedUntil() != null ? !now.isBefore(a.lockedUntil()) : now.isAfter(a.firstFailure().plus(WINDOW));
        });
    }

    private static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    public static class TooManyAttemptsException extends RuntimeException {
        private final Duration retryAfter;

        public TooManyAttemptsException(Duration retryAfter) {
            super("Too many wrong passwords. Try again in " + Math.max(1, (retryAfter.getSeconds() + 59) / 60) + " min.");
            this.retryAfter = retryAfter;
        }

        public Duration getRetryAfter() { return retryAfter; }
    }
}
