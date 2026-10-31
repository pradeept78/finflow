package com.finflow.service;

import com.finflow.repository.InviteCodeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Proxy;

import static org.junit.jupiter.api.Assertions.*;

/** Sign-up modes and how typed invite codes are read. Claiming a code is covered end to end. */
class InviteServiceTest {

    /** A repository that must never be reached: these cases decide before any lookup. */
    private static InviteCodeRepository untouchedRepo() {
        return (InviteCodeRepository) Proxy.newProxyInstance(InviteCodeRepository.class.getClassLoader(),
                new Class<?>[]{InviteCodeRepository.class}, (p, m, a) -> { throw new AssertionError("repository used: " + m.getName()); });
    }

    private static InviteService withMode(String mode) {
        InviteService s = new InviteService(untouchedRepo());
        ReflectionTestUtils.setField(s, "mode", mode);
        return s;
    }

    @Test
    void typedCodesIgnoreCaseSpacesAndDashes() {
        assertEquals("ABCDEFGHJKMN", InviteService.normalise(" abcd-efgh jkmn "));
        assertEquals("", InviteService.normalise(null));
    }

    @Test
    void anUnknownModeFallsBackToInviteOnly() {
        assertEquals("invite", withMode("").mode());
        assertEquals("invite", withMode("OPEN-ish").mode());
        assertEquals("open", withMode(" Open ").mode());
        assertEquals("closed", withMode("closed").mode());
    }

    @Test
    void openModeNeedsNoCode() {
        assertDoesNotThrow(() -> withMode("open").admit(null, "a@x.in"));
    }

    @Test
    void closedModeRefusesEveryone() {
        var ex = assertThrows(RuntimeException.class, () -> withMode("closed").admit("ABCDEFGHJKMN", "a@x.in"));
        assertEquals("Sign-up is closed", ex.getMessage());
    }

    @Test
    void inviteModeRefusesAMissingCodeWithoutALookup() {
        assertThrows(RuntimeException.class, () -> withMode("invite").admit("  - ", "a@x.in"));
    }
}
