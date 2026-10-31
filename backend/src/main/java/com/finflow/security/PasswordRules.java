package com.finflow.security;

/**
 * The password rule for new passwords set after sign-up (own change, admin reset): 10 to 128
 * characters with a letter and a number. Sign-up checks the same through RegisterRequest's annotations.
 */
public final class PasswordRules {
    private PasswordRules() {}

    /** Throws with a message the user can act on, or returns quietly. */
    public static void check(String password) {
        if (password == null || password.length() < 10 || password.length() > 128)
            throw new RuntimeException("Password must be 10 to 128 characters");
        if (!password.matches("(?s).*[A-Za-z].*") || !password.matches("(?s).*[0-9].*"))
            throw new RuntimeException("Password must include a letter and a number");
    }
}
