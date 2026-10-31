package com.finflow.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

/** The login lockout: 5 wrong passwords in 15 minutes lock the email for 15 minutes. */
class LoginAttemptServiceTest {

    /** A clock the test moves by hand. */
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-10-31T10:00:00Z");
        void advance(Duration d) { now = now.plus(d); }
        @Override public Instant instant() { return now; }
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
    }

    private final TestClock clock = new TestClock();
    private final LoginAttemptService service = new LoginAttemptService(clock);

    private void fail(String email, int times) {
        for (int i = 0; i < times; i++) service.recordFailure(email);
    }

    @Test
    void fourWrongPasswordsStillAllowAnotherTry() {
        fail("a@x.in", 4);
        assertDoesNotThrow(() -> service.checkAllowed("a@x.in"));
    }

    @Test
    void theFifthWrongPasswordLocksTheEmail() {
        fail("a@x.in", 5);
        var ex = assertThrows(LoginAttemptService.TooManyAttemptsException.class, () -> service.checkAllowed("a@x.in"));
        assertEquals(Duration.ofMinutes(15), ex.getRetryAfter());
        assertTrue(ex.getMessage().contains("15 min"), ex.getMessage());
    }

    @Test
    void theLockEndsAfterFifteenMinutesAndCountsStartAgain() {
        fail("a@x.in", 5);
        clock.advance(Duration.ofMinutes(15));
        assertDoesNotThrow(() -> service.checkAllowed("a@x.in"));
        fail("a@x.in", 1);                      // one more miss after the lock is not a new lock
        assertDoesNotThrow(() -> service.checkAllowed("a@x.in"));
    }

    @Test
    void failuresSpreadOverMoreThanTheWindowDoNotLock() {
        fail("a@x.in", 4);
        clock.advance(Duration.ofMinutes(16));
        fail("a@x.in", 1);
        assertDoesNotThrow(() -> service.checkAllowed("a@x.in"));
    }

    @Test
    void aSuccessfulLoginClearsTheCount() {
        fail("a@x.in", 4);
        service.recordSuccess("a@x.in");
        fail("a@x.in", 4);
        assertDoesNotThrow(() -> service.checkAllowed("a@x.in"));
    }

    @Test
    void emailCaseAndSpacesDoNotDodgeTheLimit() {
        fail("A@X.in", 3);
        fail(" a@x.IN ", 2);
        assertThrows(LoginAttemptService.TooManyAttemptsException.class, () -> service.checkAllowed("a@x.in"));
    }

    @Test
    void oneLockedEmailDoesNotAffectAnother() {
        fail("a@x.in", 5);
        assertDoesNotThrow(() -> service.checkAllowed("b@x.in"));
    }
}
