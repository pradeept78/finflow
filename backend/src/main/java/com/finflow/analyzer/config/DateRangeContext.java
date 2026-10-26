package com.finflow.analyzer.config;

import java.time.LocalDate;

/**
 * Holds the active date-range window (from X-From / X-To headers) for the current request.
 * Ported unchanged from the standalone Statement Analyzer app — purely a date-window filter,
 * orthogonal to user identity, so the auth merge doesn't touch it.
 */
public final class DateRangeContext {
    private static final ThreadLocal<LocalDate> FROM = new ThreadLocal<>();
    private static final ThreadLocal<LocalDate> TO = new ThreadLocal<>();

    private DateRangeContext() {}

    public static void set(String from, String to) {
        FROM.set(parse(from));
        TO.set(parse(to));
    }

    private static LocalDate parse(String s) {
        if (s == null || s.isBlank()) return null;
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }

    /** True if the date is within the active window (open-ended when a bound is null). */
    public static boolean contains(LocalDate date) {
        LocalDate from = FROM.get(), to = TO.get();
        if (from == null && to == null) return true;
        if (date == null) return false;
        if (from != null && date.isBefore(from)) return false;
        if (to != null && date.isAfter(to)) return false;
        return true;
    }

    public static void clear() {
        FROM.remove();
        TO.remove();
    }
}
