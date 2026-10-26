package com.finflow.analyzer.service;

import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AnalyticsService {
    private final TransactionRepository repo;
    private final UserRepository userRepository;

    private Long currentUserId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow().getId();
    }

    public Map<String, Object> summary(String account) {
        List<Transaction> all = filtered(account);
        BigDecimal spending = sum(all, "DEBIT", false);
        // Money in = all credits except internal transfers / card-payment credits,
        // symmetric with "actual spending" excluding transfers. The excludedFromSpend
        // flag is set on every credit and must NOT be used to zero out money-in.
        BigDecimal credits = moneyIn(all);
        BigDecimal transfers = all.stream()
                .filter(t -> "TRANSFER".equals(t.getTransactionType()))
                .map(Transaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal refunds = all.stream()
                .filter(t -> "REFUND".equals(t.getTransactionType()))
                .map(Transaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalDebited = sum(all, "DEBIT", true);
        BigDecimal totalCredited = sum(all, "CREDIT", true);
        BigDecimal cardPayments = all.stream()
                .filter(t -> "DEBIT".equals(t.getDirection())
                        && "Credit Card Payment".equalsIgnoreCase(Objects.toString(t.getCategory(), "")))
                .map(Transaction::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal emiPayments = all.stream()
                .filter(t -> "DEBIT".equals(t.getDirection())
                        && "EMI".equalsIgnoreCase(Objects.toString(t.getTransactionType(), "")))
                .map(Transaction::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("transactionCount", all.size());
        result.put("totalSpending", spending);
        result.put("totalCredits", credits);
        result.put("netCashFlow", credits.subtract(spending));
        result.put("totalDebited", totalDebited);
        result.put("totalCredited", totalCredited);
        result.put("cardPayments", cardPayments);
        result.put("emiPayments", emiPayments);
        result.put("transfersExcluded", transfers);
        result.put("refunds", refunds);
        result.put("averageMonthlySpend", averageMonthly(all));
        return result;
    }

    public List<Map<String, Object>> categories(String account) {
        Map<String, BigDecimal> totals = new HashMap<>();
        filtered(account).stream()
                .filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend())
                .forEach(t -> totals.merge(analyticsCategory(t), t.getAmount(), BigDecimal::add));
        return sortedRows(totals, "category");
    }

    public List<Map<String, Object>> monthly(String account) {
        Map<YearMonth, BigDecimal> totals = new TreeMap<>();
        filtered(account).stream()
                .filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend())
                .forEach(t -> totals.merge(YearMonth.from(t.getTransactionDate()), t.getAmount(), BigDecimal::add));
        List<Map<String, Object>> result = new ArrayList<>();
        totals.forEach((p, a) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("period", p.toString());
            r.put("amount", a);
            result.add(r);
        });
        return result;
    }

    public List<Map<String, Object>> yearly(String account) {
        Map<Integer, BigDecimal> totals = new TreeMap<>();
        filtered(account).stream()
                .filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend())
                .forEach(t -> totals.merge(t.getTransactionDate().getYear(), t.getAmount(), BigDecimal::add));
        List<Map<String, Object>> result = new ArrayList<>();
        totals.forEach((y, a) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("year", y);
            r.put("amount", a);
            result.add(r);
        });
        return result;
    }

    // Income (credits, excluding transfers) by month / year — for the Money-in trend.
    public List<Map<String, Object>> incomeMonthly(String account) {
        Map<YearMonth, BigDecimal> totals = new TreeMap<>();
        filtered(account).stream()
                .filter(t -> "CREDIT".equals(t.getDirection()) && !"TRANSFER".equals(t.getTransactionType()) && !"LOAN".equals(t.getTransactionType()) && !"SAVINGS".equals(t.getTransactionType()) && t.getTransactionDate() != null)
                .forEach(t -> totals.merge(YearMonth.from(t.getTransactionDate()), t.getAmount(), BigDecimal::add));
        List<Map<String, Object>> result = new ArrayList<>();
        totals.forEach((p, a) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("period", p.toString());
            r.put("amount", a);
            result.add(r);
        });
        return result;
    }

    public List<Map<String, Object>> incomeYearly(String account) {
        Map<Integer, BigDecimal> totals = new TreeMap<>();
        filtered(account).stream()
                .filter(t -> "CREDIT".equals(t.getDirection()) && !"TRANSFER".equals(t.getTransactionType()) && !"LOAN".equals(t.getTransactionType()) && !"SAVINGS".equals(t.getTransactionType()) && t.getTransactionDate() != null)
                .forEach(t -> totals.merge(t.getTransactionDate().getYear(), t.getAmount(), BigDecimal::add));
        List<Map<String, Object>> result = new ArrayList<>();
        totals.forEach((y, a) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("year", y);
            r.put("amount", a);
            result.add(r);
        });
        return result;
    }

    // Loans reconciled per lender: taken (disbursement credits) vs paid (repayment/EMI debits).
    public List<Map<String, Object>> loans(String account) {
        Map<String, BigDecimal> taken = new HashMap<>(), paid = new HashMap<>();
        Map<String, List<Transaction>> txns = new HashMap<>();
        filtered(account).forEach(t -> {
            String lender = lenderName(t);
            if (lender == null) return;
            BigDecimal amt = t.getAmount() == null ? BigDecimal.ZERO : t.getAmount();
            if ("CREDIT".equals(t.getDirection())) taken.merge(lender, amt, BigDecimal::add);
            else paid.merge(lender, amt, BigDecimal::add);
            txns.computeIfAbsent(lender, k -> new ArrayList<>()).add(t);
        });
        Set<String> lenders = new HashSet<>();
        lenders.addAll(taken.keySet());
        lenders.addAll(paid.keySet());
        return lenders.stream().map(l -> {
            BigDecimal tk = taken.getOrDefault(l, BigDecimal.ZERO);
            BigDecimal pd = paid.getOrDefault(l, BigDecimal.ZERO);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("lender", l);
            r.put("taken", tk);
            r.put("paid", pd);
            r.put("net", pd.subtract(tk)); // +ve = paid more than taken
            r.put("transactions", (long) txns.getOrDefault(l, List.of()).size());
            r.put("txns", txViews(txns.get(l)));
            return r;
        }).sorted((a, b) -> ((BigDecimal) b.get("taken")).add((BigDecimal) b.get("paid"))
                .compareTo(((BigDecimal) a.get("taken")).add((BigDecimal) a.get("paid")))).toList();
    }

    // Person / counterparty ledger: money received (in) vs paid (out), keeping ONLY two-way
    // counterparties — i.e. real lending/borrowing where money flowed both directions.
    // kind: "upi" = people paid via UPI, "other" = everyone else (excl. lenders & card bills).
    public List<Map<String, Object>> ledger(String account, String kind) {
        Map<String, BigDecimal> recv = new HashMap<>(), paid = new HashMap<>();
        Map<String, Map<String, Long>> displayVotes = new HashMap<>();
        Map<String, List<Transaction>> txns = new HashMap<>();
        filtered(account).forEach(t -> {
            if (!ledgerMatches(t, kind)) return;
            String name = "upi".equals(kind) ? upiCounterparty(t) : merchantName(t);
            if (name == null || name.isBlank()
                    || name.toLowerCase(Locale.ROOT).contains("unknown")) return;
            String key = canonicalCounterparty(name);
            BigDecimal amt = t.getAmount() == null ? BigDecimal.ZERO : t.getAmount();
            if ("CREDIT".equals(t.getDirection())) recv.merge(key, amt, BigDecimal::add);
            else paid.merge(key, amt, BigDecimal::add);
            displayVotes.computeIfAbsent(key, k -> new HashMap<>()).merge(name, 1L, Long::sum);
            txns.computeIfAbsent(key, k -> new ArrayList<>()).add(t);
        });
        Set<String> keys = new HashSet<>();
        keys.addAll(recv.keySet());
        keys.addAll(paid.keySet());
        return keys.stream()
                // two-way only: money both received AND paid to this counterparty
                .filter(k -> recv.getOrDefault(k, BigDecimal.ZERO).signum() > 0
                        && paid.getOrDefault(k, BigDecimal.ZERO).signum() > 0)
                .map(k -> {
                    BigDecimal rc = recv.getOrDefault(k, BigDecimal.ZERO);
                    BigDecimal pd = paid.getOrDefault(k, BigDecimal.ZERO);
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("name", bestDisplay(displayVotes.get(k)));
                    r.put("received", rc);   // money you got from them
                    r.put("paid", pd);       // money you sent them
                    r.put("net", rc.subtract(pd)); // +ve = you received more (you owe) ; -ve = they owe you
                    r.put("transactions", (long) txns.getOrDefault(k, List.of()).size());
                    r.put("txns", txViews(txns.get(k)));
                    return r;
                })
                .sorted((a, b) -> ((BigDecimal) b.get("received")).add((BigDecimal) b.get("paid"))
                        .compareTo(((BigDecimal) a.get("received")).add((BigDecimal) a.get("paid"))))
                .toList();
    }

    private boolean ledgerMatches(Transaction t, String kind) {
        if (isCardPaymentTxn(t)) return false;
        if ("TRANSFER".equals(t.getTransactionType())) return false;
        return switch (kind) {
            case "upi" -> isUpiPerson(t);
            case "other" -> !isUpiPerson(t) && !isFinancialCounterparty(t) && lenderName(t) == null;
            default -> lenderName(t) == null; // "all": anything not already a named lender
        };
    }

    // Compact transaction rows for drill-down (newest first).
    private List<Map<String, Object>> txViews(List<Transaction> list) {
        if (list == null) return List.of();
        return list.stream()
                .sorted(Comparator.comparing(Transaction::getTransactionDate,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(t -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("id", t.getId());
                    r.put("date", t.getTransactionDate() == null ? null : t.getTransactionDate().toString());
                    r.put("direction", t.getDirection());
                    r.put("amount", t.getAmount());
                    r.put("description", t.getDescription());
                    r.put("merchant", t.getMerchant());
                    return r;
                }).toList();
    }

    // Normalise a lender across its different descriptors (NEFT disbursement vs NACH repayment).
    private String lenderName(Transaction t) {
        if (isCardPaymentTxn(t)) return null; // credit-card bills are not loans
        String s = (Objects.toString(t.getMerchant(), "") + " " + Objects.toString(t.getDescription(), "")).toLowerCase(Locale.ROOT);
        if (containsAny(s, "l and t", "l&t", "landt", "lt finance", "l&tfinance")) return "L&T Finance";
        if (containsAny(s, "bajaj")) return "Bajaj Finance";
        if (containsAny(s, "idfc")) return "IDFC First";
        if (containsAny(s, "hero fincorp", "hero fin")) return "Hero Fincorp";
        if (containsAny(s, "varthana")) return "Varthana Finance";
        if (containsAny(s, "hfcl")) return "HFCL";
        if (containsAny(s, "kreditbee", "krazybee")) return "KreditBee";
        if (containsAny(s, "earlysalary", "early salary", "fibe")) return "EarlySalary / Fibe";
        if (containsAny(s, "muthoot")) return "Muthoot Finance";
        if (containsAny(s, "manappuram")) return "Manappuram";
        if (containsAny(s, "aditya birla", "abfl")) return "Aditya Birla Finance";
        if (containsAny(s, "tata capital")) return "Tata Capital";
        if (containsAny(s, "fullerton", "grihum")) return "Fullerton";
        if (containsAny(s, "navi ")) return "Navi";
        if (containsAny(s, "moneytap")) return "MoneyTap";
        if (containsAny(s, "lazypay")) return "LazyPay";
        if (containsAny(s, "zestmoney")) return "ZestMoney";
        if (containsAny(s, "cashe")) return "CASHe";
        if (containsAny(s, "moneyview", "money view")) return "MoneyView";
        if (containsAny(s, "kissht")) return "Kissht";
        if (containsAny(s, "paysense")) return "PaySense";
        if (containsAny(s, "home credit")) return "Home Credit";
        if (containsAny(s, "poonawalla")) return "Poonawalla";
        if (containsAny(s, "cholamandalam", "chola ")) return "Cholamandalam";
        if (containsAny(s, "shriram")) return "Shriram Finance";
        if (containsAny(s, "incred")) return "InCred";
        if (containsAny(s, "dmi finance", "dmi ")) return "DMI Finance";
        if (containsAny(s, "piramal")) return "Piramal";
        if (containsAny(s, "lendingkart")) return "Lendingkart";
        if (containsAny(s, "flexiloan", "flexi loan")) return "FlexiLoans";
        // generic loan/EMI not tied to a named lender
        if (containsAny(s, "nach", "personal loan", "fincorp", "emi due", " loan ")) return "Other loan / EMI";
        return null;
    }

    public List<Map<String, Object>> merchants(String account) {
        return groupedCounterparties(account, "merchant", true);
    }

    public List<Map<String, Object>> upi(String account) {
        return groupedCounterparties(account, "upi", true);
    }

    public List<Map<String, Object>> allMerchants(String account) {
        return groupedCounterparties(account, "merchant", false);
    }

    public List<Map<String, Object>> allUpi(String account) {
        return groupedCounterparties(account, "upi", false);
    }

    public List<Map<String, Object>> allFinancial(String account) {
        return groupedCounterparties(account, "financial", false);
    }

    private List<Map<String, Object>> groupedCounterparties(String account, String kind, boolean limit) {
        // Group by a canonical key so name variants that differ only by case,
        // spacing or a trailing digit (e.g. "CREDCLUB1" / "CredClub") merge into one row.
        Map<String, BigDecimal> totals = new HashMap<>();
        Map<String, Long> counts = new HashMap<>();
        Map<String, Map<String, Long>> displayVotes = new HashMap<>();
        Set<String> cardKeys = new HashSet<>();
        List<Transaction> all = filtered(account);
        all.stream()
                .filter(t -> "DEBIT".equals(t.getDirection()))
                .filter(t -> switch (kind) {
                    // Financial groups real financial spending PLUS card-bill payments,
                    // so credit-card payments live here instead of a separate block.
                    case "financial" -> (isFinancialCounterparty(t) && !t.isExcludedFromSpend()) || isCardPaymentTxn(t);
                    case "upi" -> !t.isExcludedFromSpend() && isUpi(t) && isUpiPerson(t);
                    case "all" -> true; // every debit — card payments and transfers included
                    default -> !t.isExcludedFromSpend() && !isUpiPerson(t) && !isFinancialCounterparty(t) && !isCardPaymentTxn(t);
                })
                .forEach(t -> {
                    String name = switch (kind) {
                        case "upi" -> upiCounterparty(t);
                        case "financial" -> financialName(t);
                        case "all" -> isUpiPerson(t) ? upiCounterparty(t)
                                : (isFinancialCounterparty(t) || isCardPaymentTxn(t)) ? financialName(t)
                                : merchantName(t);
                        default -> merchantName(t);
                    };
                    if (name == null || name.isBlank() || "Unknown UPI".equalsIgnoreCase(name) || "Unknown".equalsIgnoreCase(name)) return;
                    String key = canonicalCounterparty(name);
                    totals.merge(key, t.getAmount(), BigDecimal::add);
                    counts.merge(key, 1L, Long::sum);
                    displayVotes.computeIfAbsent(key, k -> new HashMap<>()).merge(name, 1L, Long::sum);
                    if (isCardPaymentTxn(t)) cardKeys.add(key);
                });

        // Money credited back from these same counterparties (refunds, repayments, reversals) —
        // shown alongside the debit total instead of forcing a separate trip to the ledger page.
        // Only counted against counterparties already surfaced above, so this never changes which
        // rows appear or how they're ranked — it just adds a second number to each existing row.
        Map<String, BigDecimal> creditTotals = new HashMap<>();
        Map<String, Long> creditCounts = new HashMap<>();
        all.stream()
                .filter(t -> "CREDIT".equals(t.getDirection()))
                .forEach(t -> {
                    String name = switch (kind) {
                        case "upi" -> isUpi(t) ? upiCounterparty(t) : null;
                        case "financial" -> financialName(t);
                        case "all" -> isUpiPerson(t) ? upiCounterparty(t) : merchantName(t);
                        default -> merchantName(t);
                    };
                    if (name == null || name.isBlank()) return;
                    String key = canonicalCounterparty(name);
                    if (!totals.containsKey(key)) return;
                    creditTotals.merge(key, t.getAmount(), BigDecimal::add);
                    creditCounts.merge(key, 1L, Long::sum);
                });

        var stream = totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed());
        if (limit) stream = stream.limit(20);
        String outKey = kind.equals("merchant") ? "merchant" : "name";
        return stream.map(e -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put(outKey, bestDisplay(displayVotes.get(e.getKey())));
            // "amount"/"transactions" kept as the debit total for backward compatibility with
            // existing screens (e.g. the compact Top-20 cards); debitAmount is the same value
            // under an explicit name for the explorer table's Debit/Credit columns.
            r.put("amount", e.getValue());
            r.put("transactions", counts.getOrDefault(e.getKey(), 0L));
            r.put("debitAmount", e.getValue());
            r.put("debitTransactions", counts.getOrDefault(e.getKey(), 0L));
            r.put("creditAmount", creditTotals.getOrDefault(e.getKey(), BigDecimal.ZERO));
            r.put("creditTransactions", creditCounts.getOrDefault(e.getKey(), 0L));
            r.put("cardPayment", cardKeys.contains(e.getKey()));
            return r;
        }).toList();
    }

    /**
     * Canonical key used to merge counterparty name variants. Uppercases, keeps only
     * alphanumerics, and drops a trailing numeric suffix (statement noise) as long as
     * at least 3 characters remain — so "CREDCLUB1", "CredClub" and "credclub1" all
     * collapse together, without over-merging short names like "A1"/"A2".
     */
    public static String canonicalCounterparty(String name) {
        String k = Objects.toString(name, "").toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        String trimmed = k.replaceAll("\\d+$", "");
        return trimmed.length() >= 3 ? trimmed : k;
    }

    // Representative display name for a merged group: the most frequently seen spelling.
    private static String bestDisplay(Map<String, Long> votes) {
        if (votes == null || votes.isEmpty()) return "Unknown";
        return votes.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse("Unknown");
    }

    public List<Map<String, Object>> financial(String account) {
        return groupedCounterparties(account, "financial", true);
    }

    // Every outflow by counterparty (incl. card payments & transfers) — "where the money went".
    public List<Map<String, Object>> outflows(String account) {
        return groupedCounterparties(account, "all", true);
    }

    // Real income by counterparty (CREDIT, excluding internal transfers).
    public List<Map<String, Object>> income(String account) {
        Map<String, BigDecimal> totals = new HashMap<>();
        Map<String, Long> counts = new HashMap<>();
        Map<String, Map<String, Long>> displayVotes = new HashMap<>();
        filtered(account).stream()
                .filter(t -> "CREDIT".equals(t.getDirection()))
                .filter(t -> !"TRANSFER".equals(t.getTransactionType()) && !"LOAN".equals(t.getTransactionType()) && !"SAVINGS".equals(t.getTransactionType()))
                .forEach(t -> {
                    String name = merchantName(t);
                    if (name == null || name.isBlank() || "Unknown".equalsIgnoreCase(name)) name = "Other credit";
                    String key = canonicalCounterparty(name);
                    totals.merge(key, t.getAmount(), BigDecimal::add);
                    counts.merge(key, 1L, Long::sum);
                    displayVotes.computeIfAbsent(key, k -> new HashMap<>()).merge(name, 1L, Long::sum);
                });
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(20)
                .map(e -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("name", bestDisplay(displayVotes.get(e.getKey())));
                    r.put("amount", e.getValue());
                    r.put("transactions", counts.getOrDefault(e.getKey(), 0L));
                    return r;
                }).toList();
    }

    // Card-payment counterparties (CRED etc). These are excluded from spending, so they
    // never appear in the merchant/upi/financial lists — this exposes them on their own.
    public List<Map<String, Object>> cardPayments(String account) {
        Map<String, BigDecimal> totals = new HashMap<>();
        Map<String, Long> counts = new HashMap<>();
        Map<String, Map<String, Long>> displayVotes = new HashMap<>();
        filtered(account).stream()
                .filter(t -> "DEBIT".equals(t.getDirection())
                        && "Credit Card Payment".equalsIgnoreCase(Objects.toString(t.getCategory(), "")))
                .forEach(t -> {
                    String name = merchantName(t);
                    if (name == null || name.isBlank() || "Unknown".equalsIgnoreCase(name)) name = "Card payment";
                    String key = canonicalCounterparty(name);
                    totals.merge(key, t.getAmount(), BigDecimal::add);
                    counts.merge(key, 1L, Long::sum);
                    displayVotes.computeIfAbsent(key, k -> new HashMap<>()).merge(name, 1L, Long::sum);
                });
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(20)
                .map(e -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("name", bestDisplay(displayVotes.get(e.getKey())));
                    r.put("amount", e.getValue());
                    r.put("transactions", counts.getOrDefault(e.getKey(), 0L));
                    return r;
                }).toList();
    }

    public List<Map<String, Object>> accountSummary() {
        String profile = com.finflow.analyzer.config.ProfileContext.get();
        // Was repo.findAll() — every user's transactions before the merge added real scoping.
        Map<String, List<Transaction>> groups = repo.findByUserId(currentUserId()).stream()
                .filter(t -> profile.equals(com.finflow.analyzer.config.ProfileContext.normalize(t.getProfile())))
                .collect(Collectors.groupingBy(t -> Objects.toString(t.getAccount(), "unknown")));
        List<Map<String, Object>> result = new ArrayList<>();
        groups.forEach((account, txs) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("account", account);
            r.put("transactions", txs.size());
            r.put("spending", sum(txs, "DEBIT", false));
            r.put("credits", moneyIn(txs));
            result.add(r);
        });
        return result;
    }

    public List<Map<String, Object>> insights(String account) {
        List<Transaction> all = filtered(account);
        List<Map<String, Object>> result = new ArrayList<>();

        if (all.isEmpty()) return result;

        Map<YearMonth, BigDecimal> months = new TreeMap<>();
        all.stream()
                .filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend())
                .forEach(t -> months.merge(YearMonth.from(t.getTransactionDate()), t.getAmount(), BigDecimal::add));

        if (!months.isEmpty()) {
            var peak = months.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow();
            result.add(insight("Peak month", peak.getKey().toString(), peak.getValue(),
                    "Highest spending month. Click to review every transaction."));
        }

        var topCategory = categories(account).stream().findFirst();
        if (topCategory.isPresent()) {
            result.add(insight("Largest category",
                    Objects.toString(topCategory.get().get("category"), "Other"),
                    (BigDecimal) topCategory.get().get("amount"),
                    "Your largest spending category. Click to review it."));
        }

        var topMerchant = merchants(account).stream().findFirst();
        if (topMerchant.isPresent()) {
            result.add(insight("Top merchant",
                    Objects.toString(topMerchant.get().get("merchant"), "Unknown"),
                    (BigDecimal) topMerchant.get().get("amount"),
                    "Your highest-spend merchant. Click to review it."));
        }

        long recurring = all.stream().filter(Transaction::isRecurring).count();
        if (recurring > 0) {
            result.add(insight("Recurring detected", String.valueOf(recurring), BigDecimal.valueOf(recurring), "Transactions marked as recurring."));
        }

        return result;
    }

    private Map<String, Object> insight(String title, String value, BigDecimal amount, String detail) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("title", title);
        r.put("value", value);
        r.put("amount", amount);
        r.put("detail", detail);
        return r;
    }

    private boolean isActualSpending(Transaction t) {
        return "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend();
    }

    private boolean isCardPaymentTxn(Transaction t) {
        return "Credit Card Payment".equalsIgnoreCase(Objects.toString(t.getCategory(), ""));
    }

    private boolean isUpi(Transaction t) {
        String d = Objects.toString(t.getDescription(), "").toLowerCase(Locale.ROOT);
        return d.contains("upi/") || d.startsWith("upi") || d.contains("upi-");
    }

    private boolean isUpiPerson(Transaction t) {
        if (!isUpi(t)) return false;
        String name = upiCounterparty(t).toLowerCase(Locale.ROOT);
        String d = Objects.toString(t.getDescription(), "").toLowerCase(Locale.ROOT);
        if (name.isBlank() || name.equals("unknown upi")) return false;
        if (isKnownMerchant(name) || isFinancialName(name)) return false;
        // QR/payment rails themselves are not people.
        if (name.equals("paytm") || name.equals("bharatpe") || name.equals("phonepe") || name.equals("google pay")) {
            return false;
        }
        // UPI handles with common person-style handles are treated as people.
        // Was "upi/" only — that's the slash-delimited narration style some banks use
        // (e.g. "UPI/CR/.../NAME/..."). HDFC (and others) use a hyphen-delimited style
        // instead ("UPI-NAME-handle@psp-IFSC-ref-PAYMENT FROM PHONE ref"), which contains
        // no "/" at all, so every hyphen-style person-to-person transfer was silently
        // excluded from "People & UPI" and fell through to Merchants instead.
        return d.contains("upi/") || d.contains("upi-");
    }

    private boolean isFinancialCounterparty(Transaction t) {
        String d = Objects.toString(t.getDescription(), "").toLowerCase(Locale.ROOT);
        String m = Objects.toString(t.getMerchant(), "").toLowerCase(Locale.ROOT);
        return isFinancialName(m) || isFinancialName(d)
                || Objects.toString(t.getCategory(), "").toLowerCase(Locale.ROOT).contains("emi")
                || Objects.toString(t.getCategory(), "").toLowerCase(Locale.ROOT).contains("bank charges");
    }

    /** The category bucket a transaction shows under in the Spending mix (computed, not just stored). */
    public String categoryOf(Transaction t) {
        return analyticsCategory(t);
    }

    private String analyticsCategory(Transaction t) {
        String stored = Objects.toString(t.getCategory(), "").trim();
        if (!stored.isBlank() && !"other".equalsIgnoreCase(stored)) return stored;

        String text = (Objects.toString(t.getMerchant(), "") + " " +
                Objects.toString(t.getDescription(), "")).toLowerCase(Locale.ROOT);

        if (isFinancialName(text)) return "Financial";
        if (containsAny(text, "amazon", "flipkart", "myntra", "ajio", "meesho", "swiggy", "zomato",
                "kfc", "dominos", "pizza", "blinkit", "zepto", "bigbasket", "dmart", "uber", "ola",
                "rapido", "irctc", "makemytrip", "goibibo", "bookmyshow", "pvr", "inox", "netflix",
                "spotify", "prime video", "youtube", "cred", "cred club")) return "Shopping & lifestyle";
        if (containsAny(text, "airtel", "jio", "vodafone", "bescom")) return "Bills & utilities";
        if (containsAny(text, "shell", "hpcl", "bharat petroleum", "indian oil", "iocl", "nayara")) return "Fuel";
        if (containsAny(text, "atm", "cash withdrawal")) return "Cash withdrawal";
        if (isUpiPerson(t)) return "People & UPI";
        return "Other";
    }

    private boolean isKnownMerchant(String value) {
        return containsAny(value,
                "amazon", "flipkart", "myntra", "ajio", "meesho", "swiggy", "zomato", "kfc", "dominos",
                "pizza", "blinkit", "zepto", "bigbasket", "dmart", "uber", "ola", "rapido", "irctc",
                "makemytrip", "goibibo", "bookmyshow", "pvr", "inox", "netflix", "spotify", "prime video", "cred", "cred club",
                "youtube", "airtel", "jio", "vodafone", "bescom", "shell", "hpcl", "bharat petroleum",
                "indian oil", "iocl", "nayara");
    }

    private boolean isFinancialName(String value) {
        return containsAny(value,
                "bajaj finance", "idfc first", "idfc", "hdfc", "kotak", "icici", "axis", "axis bank", "sbi", "state bank",
                "bank", "finance", "capital", "loan", "emi", "nach", "mandate", "insurance", "lic ", "lombard",
                "bajaj finserv", "tata capital", "aditya birla finance",
                // lenders / BNPL / brokers so they group under Financial, not People
                "kreditbee", "earlysalary", "muthoot", "manappuram", "moneytap", "lazypay",
                "zestmoney", "abfl", "aditya birla", "upstox", "zerodha", "groww", "mobikwik", "simpl");
    }

    private boolean containsAny(String value, String... keywords) {
    if (value == null || value.isBlank()) {
        return false;
    }

    String normalized = value.toLowerCase(Locale.ROOT);

    for (String keyword : keywords) {
        if (keyword != null && !keyword.isBlank()
                && normalized.contains(keyword.toLowerCase(Locale.ROOT))) {
            return true;
        }
    }

    return false;
}

    private String merchantName(Transaction t) {
        String m = Objects.toString(t.getMerchant(), "").trim();
        if (!m.isBlank()) return normalizeName(m);

        String d = Objects.toString(t.getDescription(), "").trim();
        if (d.isBlank()) return "Unknown";

        if (isUpi(t)) {
            String cp = upiCounterparty(t);
            if (!cp.isBlank() && !"Unknown UPI".equalsIgnoreCase(cp)
                    && !isUpiPerson(t) && !isFinancialCounterparty(t)) {
                return normalizeName(cp);
            }
        }

        String[] parts = d.split("/");
        if (parts.length > 1 && !parts[1].isBlank()) return normalizeName(parts[1]);
        return normalizeName(d);
    }



    private String financialName(Transaction t) {
        String m = Objects.toString(t.getMerchant(), "").trim();
        if (!m.isBlank() && isFinancialName(m.toLowerCase(Locale.ROOT))) return normalizeName(m);
        String d = Objects.toString(t.getDescription(), "");
        String lower = d.toLowerCase(Locale.ROOT);
        if (lower.contains("bajaj finance")) return "Bajaj Finance";
        if (lower.contains("idfc first")) return "IDFC FIRST Bank";
        if (lower.contains("tata capital")) return "Tata Capital";
        if (lower.contains("hdfc")) return "HDFC Bank / Finance";
        if (lower.contains("kotak")) return "Kotak Mahindra Bank";
        if (lower.contains("icici")) return "ICICI Bank / Finance";
        if (lower.contains("axis")) return "Axis Bank";
        if (lower.contains("sbi") || lower.contains("state bank")) return "SBI";
        return normalizeName(m.isBlank() ? d : m);
    }

    private String normalizeName(String value) {
        String v = Objects.toString(value, "").replaceAll("\\s+", " ").trim();
        if (v.length() > 70) v = v.substring(0, 70).trim();
        return v;
    }

    private String upiCounterparty(Transaction t) {
        String merchant = Objects.toString(t.getMerchant(), "").trim();
        String d = Objects.toString(t.getDescription(), "");
        // Slash-delimited narrations ("UPI/CR/.../NAME/...") split on "/"; hyphen-delimited ones
        // ("UPI-NAME-handle@psp-IFSC-ref-...", HDFC's style) have no "/" at all, so splitting on
        // "/" always fell back to the raw merchant text instead of the actual counterparty name.
        String[] parts = d.toLowerCase(Locale.ROOT).startsWith("upi-") ? d.split("-") : d.split("/");
        String cp = parts.length >= 2 ? parts[1].trim() : merchant;
        if (cp.isBlank()) cp = merchant;
        cp = cp.replaceAll("(?i)@.*$", "").trim();
        String lower = cp.toLowerCase(Locale.ROOT);
        if (lower.startsWith("paytm")) return "Paytm";
        if (lower.startsWith("bharatpe")) return "BharatPe";
        if (lower.startsWith("phonepe")) return "PhonePe";
        if (lower.startsWith("gpay") || lower.startsWith("googlepay")) return "Google Pay";
        return normalizeName(cp);
    }

    private List<Transaction> filtered(String account) {
        String profile = com.finflow.analyzer.config.ProfileContext.get();
        // Was repo.findAll() — every user's transactions before the merge added real scoping.
        return repo.findByUserId(currentUserId()).stream()
                .filter(t -> profile.equals(com.finflow.analyzer.config.ProfileContext.normalize(t.getProfile())))
                .filter(t -> com.finflow.analyzer.config.DateRangeContext.contains(t.getTransactionDate()))
                .filter(t -> account == null || account.isBlank() || account.equals(t.getAccount()))
                .toList();
    }

    private BigDecimal sum(List<Transaction> all, String direction, boolean includeExcluded) {
        return all.stream()
                .filter(t -> direction.equals(t.getDirection()) && (includeExcluded || !t.isExcludedFromSpend()))
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // Real money in: credits that are not internal transfers or card-payment credits.
    public static BigDecimal moneyIn(List<Transaction> all) {
        return all.stream()
                .filter(t -> "CREDIT".equals(t.getDirection()))
                .filter(t -> !"TRANSFER".equals(t.getTransactionType()) && !"LOAN".equals(t.getTransactionType()) && !"SAVINGS".equals(t.getTransactionType()))
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal averageMonthly(List<Transaction> all) {
        Set<YearMonth> months = all.stream()
                .filter(t -> t.getTransactionDate() != null)
                .map(t -> YearMonth.from(t.getTransactionDate()))
                .collect(Collectors.toSet());
        if (months.isEmpty()) return BigDecimal.ZERO;
        return sum(all, "DEBIT", false).divide(BigDecimal.valueOf(months.size()), 2, RoundingMode.HALF_UP);
    }

    private List<Map<String, Object>> sortedRows(Map<String, BigDecimal> totals, String key) {
        return topRows(totals, key, Integer.MAX_VALUE);
    }

    private List<Map<String, Object>> topRows(Map<String, BigDecimal> totals, String key, int limit) {
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(limit)
                .map(e -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put(key, e.getKey());
                    r.put("amount", e.getValue());
                    return r;
                }).toList();
    }

    private String money(BigDecimal n) {
        return "₹" + n.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }
}
