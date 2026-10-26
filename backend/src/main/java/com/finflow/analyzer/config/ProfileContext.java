package com.finflow.analyzer.config;

/**
 * Holds the active profile for the current request (set from the X-Profile header).
 * Lets every query scope to one profile without threading a param through every method.
 *
 * Ported unchanged from the standalone Statement Analyzer app. There, this was the only
 * isolation — no login existed. Merged into finflow-clean, real isolation is the JWT-authenticated
 * user (see each controller/service's currentUser()); this remains exactly what it always was, an
 * optional sub-label *within* one user's own data (e.g. "Default" vs "Business"), not a security
 * boundary — so it needed no changes.
 */
public final class ProfileContext {
    public static final String DEFAULT = "Default";
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private ProfileContext() {}

    public static void set(String profile) {
        CURRENT.set(profile == null || profile.isBlank() ? DEFAULT : profile.trim());
    }

    public static String get() {
        String p = CURRENT.get();
        return p == null ? DEFAULT : p;
    }

    /** Normalise a stored value (null/blank counts as the Default profile). */
    public static String normalize(String stored) {
        return stored == null || stored.isBlank() ? DEFAULT : stored.trim();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
