package com.finflow.messages;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads one Indian bank SMS or alert email and says what it is. Pure text in, facts out: no database,
 * no guessing about which card or loan it is (BankMessageService matches the last 4 digits).
 *
 * What it understands (the "spends + bills + EMIs" scope):
 *   CARD_SPEND      "Rs.1,250 spent on HDFC Bank Card x4521 at SWIGGY on …"
 *   CARD_STATEMENT  "… Card XX4521 statement … Total Amt Due Rs.84,200 … Due Date 12-11-2026"
 *   CARD_PAYMENT    "Payment of Rs.84,200 received towards your … Card XX4521"
 *   CARD_EMI        "Your transaction of Rs.60,000 at CROMA on … Card XX4521 has been converted to EMI for 12 months"
 *   EMI_DEBIT       "EMI of Rs 17,800 for your loan account ending 5678 has been debited …"
 * Everything else is IGNORED with a reason (OTPs, declines, refunds, bank-account and debit-card
 * payments) or UNKNOWN. Anything it can't read safely is never turned into money.
 */
public final class BankMessageParser {

    public enum Kind { CARD_SPEND, CARD_STATEMENT, CARD_PAYMENT, CARD_EMI, EMI_DEBIT, IGNORED, UNKNOWN }

    /** What one message says. Fields that don't apply to its kind stay null. */
    public record Parsed(Kind kind, BigDecimal amount, String last4, String merchant, LocalDate date,
                         LocalDate dueDate, BigDecimal minDue, Integer tenure, BigDecimal emiAmount, String note) {
        static Parsed ignored(String why) { return new Parsed(Kind.IGNORED, null, null, null, null, null, null, null, null, why); }
    }

    private BankMessageParser() {}

    private static final int F = Pattern.CASE_INSENSITIVE;
    private static final String MONEY = "(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)";
    private static final Pattern AMOUNT = Pattern.compile(MONEY, F);
    /** Masked number right after "card" / "loan …": XX4521, x4521, **4521, ending 4521, no. XXXXXXXX9012. */
    private static final String MASKED = "[^\\d\\n]{0,40}?(?:[x*]{1,12}|ending\\s+(?:with\\s+)?|no\\.?\\s*[x*]*)(\\d{4})(?!\\d)";
    private static final Pattern CARD_LAST4 = Pattern.compile("card" + MASKED, F);
    private static final Pattern LOAN_LAST4 = Pattern.compile("loan" + MASKED, F);
    private static final Pattern TOTAL_DUE = Pattern.compile("total\\s+(?:amt|amount)\\s+due[^\\d₹]{0,12}?" + MONEY, F);
    private static final Pattern MIN_DUE = Pattern.compile("min(?:imum)?\\.?\\s+(?:amt|amount)\\s+due[^\\d₹]{0,12}?" + MONEY, F);
    private static final Pattern EMI_AMOUNT = Pattern.compile("emi(?:\\s+(?:amount|amt))?\\s*(?:of|:|-)?\\s*" + MONEY, F);
    private static final Pattern TENURE = Pattern.compile("(\\d{1,3})\\s*(?:months?|mths?)", F);
    private static final Pattern MERCHANT_AT = Pattern.compile("\\bat\\s+([A-Za-z0-9][A-Za-z0-9 .&'*_/-]{1,60}?)(?=\\s+on\\b|\\s+via\\b|\\s+has\\b|\\s*[.,;]\\s|\\.?\\s*$|\\s+avl|\\s+txn|\\n)", F);
    /** ICICI style: "… on 29-Oct-26 on AMAZON PAY IN. Avl Limit …" */
    private static final Pattern MERCHANT_ON_ON = Pattern.compile("\\bon\\s+\\S+\\s+on\\s+([A-Za-z0-9][A-Za-z0-9 .&'*_/-]{1,60}?)(?=\\.\\s|\\.?\\s*$|\\s+avl)", F);

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            fmt("yyyy-MM-dd"), fmt("d-M-yyyy"), fmt("d/M/yyyy"), fmt("d-MMM-yyyy"), fmt("d MMM yyyy"),
            fmt2("d-M-"), fmt2("d/M/"), fmt2("d-MMM-"), fmt2("d MMM "));
    private static final Pattern DATE = Pattern.compile(
            "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/](?:\\d{1,2}|[A-Za-z]{3})[-/]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{2,4})");

    public static Parsed parse(String text) {
        if (text == null || text.isBlank()) return new Parsed(Kind.UNKNOWN, null, null, null, null, null, null, null, null, "Empty message");
        String t = text.replace(' ', ' ').trim();
        String low = t.toLowerCase(Locale.ROOT);

        if (low.matches("(?s).*\\b(otp|one time password|verification code)\\b.*")) return Parsed.ignored("One-time password");
        if (low.matches("(?s).*\\b(declined|failed|unsuccessful|reversed|not processed)\\b.*")) return Parsed.ignored("Declined or failed payment");

        BigDecimal first = amount(AMOUNT, t);
        String cardLast4 = group(CARD_LAST4, t);

        if (low.contains("converted to emi") || low.contains("converted into emi") || low.contains("emi conversion")) {
            return new Parsed(Kind.CARD_EMI, first, cardLast4, merchant(t), date(t), null, null,
                    intGroup(TENURE, t), amountAfter(EMI_AMOUNT, t, "converted"), null);
        }
        if (low.contains("statement") && TOTAL_DUE.matcher(t).find()) {
            return new Parsed(Kind.CARD_STATEMENT, amount(TOTAL_DUE, t), cardLast4, null, null,
                    dateAfter(t, "due date", "due by", "due on", "payable by", "pay by"), amount(MIN_DUE, t), null, null, null);
        }
        if (low.contains("card") && low.matches("(?s).*\\b(payment|paid)\\b.*") && low.matches("(?s).*\\b(received|credited|successful)\\b.*")) {
            return new Parsed(Kind.CARD_PAYMENT, first, cardLast4, null, date(t), null, null, null, null, null);
        }
        if (low.matches("(?s).*\\bemi\\b.*") && low.contains("loan") && low.matches("(?s).*\\b(debited|deducted|presented|paid|collected|received)\\b.*")) {
            BigDecimal emi = amountAfter(EMI_AMOUNT, t, null);
            return new Parsed(Kind.EMI_DEBIT, emi != null ? emi : first, group(LOAN_LAST4, t), null, date(t), null, null, null, null, null);
        }
        if (low.matches("(?s).*\\b(refund|refunded|cashback)\\b.*") || (low.contains("credited") && !low.contains("debited")))
            return Parsed.ignored("Money coming in (refund or credit) — not handled yet");
        if (low.contains("debit card")) return Parsed.ignored("Debit card payment (from a bank account, not a credit card)");
        if (low.contains("card") && cardLast4 != null && first != null
                && low.matches("(?s).*\\b(spent|spend|used|purchase|txn|transaction|debited|charged)\\b.*")) {
            return new Parsed(Kind.CARD_SPEND, first, cardLast4, merchant(t), date(t), null, null, null, null, null);
        }
        if (low.matches("(?s).*\\b(debited|a/c|upi|vpa|neft|imps)\\b.*")) return Parsed.ignored("Bank account payment (UPI, transfer) — not a card or EMI");
        return new Parsed(Kind.UNKNOWN, first, cardLast4, null, null, null, null, null, null, "Couldn't tell what this message is");
    }

    // ── helpers ──

    private static String group(Pattern p, String t) {
        Matcher m = p.matcher(t);
        return m.find() ? m.group(1) : null;
    }

    private static Integer intGroup(Pattern p, String t) {
        String g = group(p, t);
        return g == null ? null : Integer.valueOf(g);
    }

    private static BigDecimal amount(Pattern p, String t) {
        Matcher m = p.matcher(t);
        return m.find() ? money(m.group(m.groupCount())) : null;
    }

    /** The amount in an "EMI Rs.X" phrase; with `after`, only one appearing after that word. */
    private static BigDecimal amountAfter(Pattern p, String t, String after) {
        int from = 0;
        if (after != null) {
            int i = t.toLowerCase(Locale.ROOT).indexOf(after);
            if (i < 0) return null;
            from = i;
        }
        Matcher m = p.matcher(t);
        return m.find(from) ? money(m.group(1)) : null;
    }

    private static BigDecimal money(String s) {
        try { return new BigDecimal(s.replace(",", "")); } catch (NumberFormatException e) { return null; }
    }

    private static String merchant(String t) {
        for (Pattern p : List.of(MERCHANT_AT, MERCHANT_ON_ON)) {
            String g = group(p, t);
            if (g != null && !g.isBlank() && !g.matches("(?i)\\d.*|.*\\bcard\\b.*")) return clean(g);
        }
        // Axis style: amount line, card line, date line, then the merchant on a line of its own.
        String[] lines = t.split("\\R");
        for (int i = 0; i + 1 < lines.length; i++) {
            if (DATE.matcher(lines[i]).find() && lines[i].matches("(?i).*\\d{1,2}:\\d{2}.*")) {
                String next = lines[i + 1].trim();
                if (!next.isEmpty() && !next.matches("(?i)(avl|available|not you).*")) return clean(next);
            }
        }
        return null;
    }

    private static String clean(String m) {
        String s = m.trim().replaceAll("\\s+", " ");
        return s.length() > 60 ? s.substring(0, 60) : s;
    }

    private static LocalDate date(String t) {
        Matcher m = DATE.matcher(t);
        while (m.find()) {
            LocalDate d = toDate(m.group(1));
            if (d != null) return d;
        }
        return null;
    }

    /** The first date after any of the phrases ("due date", "due by"…), else null. */
    private static LocalDate dateAfter(String t, String... phrases) {
        String low = t.toLowerCase(Locale.ROOT);
        for (String ph : phrases) {
            int i = low.indexOf(ph);
            if (i >= 0) {
                LocalDate d = date(t.substring(i));
                if (d != null) return d;
            }
        }
        return null;
    }

    static LocalDate toDate(String s) {
        String v = s.trim();
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                LocalDate d = LocalDate.parse(v, f);
                if (d.getYear() >= 2000 && d.getYear() <= 2100) return d;
            } catch (Exception ignored) { }
        }
        return null;
    }

    private static DateTimeFormatter fmt(String pattern) {
        return new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(pattern).toFormatter(Locale.ENGLISH);
    }

    /** dd-MM-yy and friends: two-digit years read as 20yy. */
    private static DateTimeFormatter fmt2(String prefix) {
        return new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(prefix)
                .appendValueReduced(ChronoField.YEAR, 2, 2, 2000).toFormatter(Locale.ENGLISH);
    }
}
