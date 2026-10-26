package com.finflow.analyzer.controller;

import com.finflow.analyzer.config.DateRangeContext;
import com.finflow.analyzer.config.ProfileContext;
import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.analyzer.service.AnalyticsService;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/transactions")
@RequiredArgsConstructor
public class TransactionController {
    private final TransactionRepository repo;
    private final AnalyticsService analytics;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    @GetMapping
    public List<Transaction> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) String direction,
            @RequestParam(required = false) String transactionType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "200") int size) {

        return filtered(q, category, account, year, month, direction, transactionType).stream()
                .skip((long) page * Math.min(size, 1000))
                .limit(Math.min(size, 1000))
                .toList();
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) String direction,
            @RequestParam(required = false) String transactionType,
            @RequestParam(required = false) String counterparty) {
        List<Transaction> all = filtered(q, category, account, year, month, direction, transactionType, counterparty);
        BigDecimal out = all.stream().filter(t -> "DEBIT".equalsIgnoreCase(t.getDirection()))
                .map(Transaction::getAmount).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal in = all.stream().filter(t -> "CREDIT".equalsIgnoreCase(t.getDirection()))
                .map(Transaction::getAmount).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("out", out); result.put("in", in);
        result.put("net", in.subtract(out)); result.put("count", all.size());
        return result;
    }

    @GetMapping("/page")
    public Map<String, Object> page(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) String direction,
            @RequestParam(required = false) String transactionType,
            @RequestParam(required = false) String counterparty,
            // Optional manual-debt-link filter, used by the Debt Matching page to pull the
            // transactions already linked to one specific loan/card — additive, every existing
            // caller that omits these two params is unaffected.
            @RequestParam(required = false) String linkedDebtType,
            @RequestParam(required = false) Long linkedDebtId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        int pageSize = Math.max(10, Math.min(size, 100));
        List<Transaction> all = filtered(q, category, account, year, month, direction, transactionType, counterparty);
        if (linkedDebtType != null && !linkedDebtType.isBlank()) {
            all = all.stream()
                    .filter(t -> linkedDebtType.equalsIgnoreCase(t.getLinkedDebtType())
                            && (linkedDebtId == null || linkedDebtId.equals(t.getLinkedDebtId())))
                    .toList();
        }
        int from = Math.min(page * pageSize, all.size());
        int to = Math.min(from + pageSize, all.size());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", all.subList(from, to));
        result.put("page", page);
        result.put("size", pageSize);
        result.put("total", all.size());
        result.put("pages", (int) Math.ceil(all.size() / (double) pageSize));
        return result;
    }

    // findByIdAndUserId, not findById — without the ownership check a request naming another
    // user's numeric transaction id could edit/delete it (findById alone has no owner filter).
    @PatchMapping("/{id}")
    public Transaction update(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Transaction t = repo.findByIdAndUserId(id, currentUser().getId()).orElseThrow();
        if (body.containsKey("category")) t.setCategory(body.get("category"));
        if (body.containsKey("subCategory")) t.setSubCategory(body.get("subCategory"));
        if (body.containsKey("transactionType")) t.setTransactionType(body.get("transactionType"));
        if (body.containsKey("merchant")) t.setMerchant(body.get("merchant"));
        if (body.containsKey("excludedFromSpend")) t.setExcludedFromSpend(Boolean.parseBoolean(body.get("excludedFromSpend")));
        // Manual debt link — key present but null/blank clears the link (unlinking), key present
        // with a value sets it. Unlike category/merchant/etc above this genuinely needs a "clear"
        // path: a mis-click on the wrong loan/card has to be undoable.
        if (body.containsKey("linkedDebtType")) {
            String v = body.get("linkedDebtType");
            t.setLinkedDebtType((v == null || v.isBlank()) ? null : v);
        }
        if (body.containsKey("linkedDebtId")) {
            String v = body.get("linkedDebtId");
            t.setLinkedDebtId((v == null || v.isBlank()) ? null : Long.valueOf(v));
        }
        return repo.save(t);
    }

    /** Apply the same field changes to many transactions. Only non-null fields are changed. */
    @PostMapping("/bulk-update")
    public Map<String, Object> bulkUpdate(@RequestBody Map<String, Object> body) {
        List<?> ids = (List<?>) body.getOrDefault("ids", List.of());
        String category = blankToNull(body.get("category"));
        String type = blankToNull(body.get("transactionType"));
        String merchant = blankToNull(body.get("merchant"));
        Boolean excluded = body.get("excludedFromSpend") == null ? null
                : Boolean.parseBoolean(body.get("excludedFromSpend").toString());
        // Manual debt link, bulk path. Setting follows the same "blank = don't touch" convention as
        // category/type/merchant above. Clearing a batch of links needs an explicit flag rather than
        // relying on blank-means-clear (which would conflict with that convention), so a dedicated
        // `unlinkDebt: true` clears linkedDebtType/linkedDebtId on every selected transaction.
        String linkedDebtType = blankToNull(body.get("linkedDebtType"));
        Object linkedDebtIdRaw = body.get("linkedDebtId");
        Long linkedDebtId = (linkedDebtIdRaw == null || linkedDebtIdRaw.toString().isBlank())
                ? null : Long.valueOf(linkedDebtIdRaw.toString());
        boolean unlinkDebt = Boolean.parseBoolean(Objects.toString(body.get("unlinkDebt"), "false"));
        int updated = 0;
        Long userId = currentUser().getId();
        for (Object raw : ids) {
            Long id;
            try { id = Long.valueOf(raw.toString()); } catch (NumberFormatException e) { continue; }
            var opt = repo.findByIdAndUserId(id, userId);
            if (opt.isEmpty()) continue;
            Transaction t = opt.get();
            if (category != null) t.setCategory(category);
            if (type != null) t.setTransactionType(type);
            if (merchant != null) t.setMerchant(merchant);
            if (excluded != null) t.setExcludedFromSpend(excluded);
            if (unlinkDebt) {
                t.setLinkedDebtType(null);
                t.setLinkedDebtId(null);
            } else {
                if (linkedDebtType != null) t.setLinkedDebtType(linkedDebtType);
                if (linkedDebtId != null) t.setLinkedDebtId(linkedDebtId);
            }
            repo.save(t);
            updated++;
        }
        return Map.of("updated", updated);
    }

    private String blankToNull(Object v) {
        String s = v == null ? null : v.toString().trim();
        return (s == null || s.isEmpty()) ? null : s;
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        Long userId = currentUser().getId();
        boolean existed = repo.existsByIdAndUserId(id, userId);
        if (existed) repo.deleteById(id);
        return Map.of("deleted", existed);
    }

    @PostMapping("/bulk-delete")
    public Map<String, Object> bulkDelete(@RequestBody Map<String, Object> body) {
        // Was `Map<String, List<Long>>` with a `for (Long id : ids)` loop directly against the
        // deserialized list. Jackson deserialized each JSON number in the "ids" array as a plain
        // Integer (it fits in an int, and nothing here forced the per-element target type at
        // deserialization time), so the implicit unboxing cast to Long on every iteration threw
        // "Integer cannot be cast to Long" for every bulk-delete request, however small the id list.
        // Same safe parse-via-string pattern bulkUpdate already uses above, which never hit this.
        List<?> ids = (List<?>) body.getOrDefault("ids", List.of());
        Long userId = currentUser().getId();
        long n = 0;
        for (Object raw : ids) {
            if (raw == null) continue;
            Long id;
            try { id = Long.valueOf(raw.toString()); } catch (NumberFormatException e) { continue; }
            if (repo.existsByIdAndUserId(id, userId)) { repo.deleteById(id); n++; }
        }
        return Map.of("deleted", n);
    }

    @GetMapping(value = "/export", produces = "text/csv")
    public byte[] export(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) String direction,
            @RequestParam(required = false) String transactionType,
            @RequestParam(required = false) String counterparty) {
        // Was `filtered(null, null, account)` — every other filter the table UI supports (search
        // text, category, year, month, direction, type, counterparty) was silently dropped, so
        // "Export CSV" always dumped the account's entire history instead of the rows actually on
        // screen. Now takes the same filter set as /transactions and /transactions/summary.
        StringBuilder s = new StringBuilder("Date,Account,Description,Merchant,Amount,Direction,Category,SubCategory,Type,Source,Excluded\n");
        filtered(q, category, account, year, month, direction, transactionType, counterparty).forEach(t -> s.append(csv(t.getTransactionDate())).append(',')
                .append(csv(t.getAccount())).append(',')
                .append(csv(t.getDescription())).append(',')
                .append(csv(t.getMerchant())).append(',')
                .append(t.getAmount()).append(',')
                .append(csv(t.getDirection())).append(',')
                .append(csv(t.getCategory())).append(',')
                .append(csv(t.getSubCategory())).append(',')
                .append(csv(t.getTransactionType())).append(',')
                .append(csv(t.getSourceFile())).append(',')
                .append(t.isExcludedFromSpend()).append('\n'));
        return s.toString().getBytes(StandardCharsets.UTF_8);
    }

    private List<Transaction> filtered(String q, String category, String account) {
        return filtered(q, category, account, null, null, null, null, null);
    }

    private List<Transaction> filtered(String q, String category, String account, Integer year, String month, String direction, String transactionType) {
        return filtered(q, category, account, year, month, direction, transactionType, null);
    }

    private List<Transaction> filtered(String q, String category, String account, Integer year, String month, String direction, String transactionType, String counterparty) {
        String cpKey = (counterparty == null || counterparty.isBlank()) ? null : AnalyticsService.canonicalCounterparty(counterparty);
        String profile = ProfileContext.get();
        // Was repo.findAll(Sort...) — every user's transactions loaded before filtering in Java.
        return repo.findByUserId(currentUser().getId(), Sort.by(Sort.Direction.DESC, "transactionDate", "id")).stream()
                .filter(t -> profile.equals(ProfileContext.normalize(t.getProfile())))
                .filter(t -> DateRangeContext.contains(t.getTransactionDate()))
                .filter(t -> q == null || q.isBlank() || contains(t.getDescription(), q) || contains(t.getMerchant(), q))
                .filter(t -> category == null || category.isBlank()
                        || category.equalsIgnoreCase(t.getCategory())
                        || category.equalsIgnoreCase(analytics.categoryOf(t)))
                .filter(t -> account == null || account.isBlank() || account.equals(t.getAccount()))
                .filter(t -> year == null || (t.getTransactionDate() != null && t.getTransactionDate().getYear() == year))
                .filter(t -> month == null || month.isBlank() || (t.getTransactionDate() != null && t.getTransactionDate().toString().startsWith(month)))
                .filter(t -> direction == null || direction.isBlank() || direction.equalsIgnoreCase(t.getDirection()))
                .filter(t -> transactionType == null || transactionType.isBlank() || transactionType.equalsIgnoreCase(t.getTransactionType()))
                // Counterparty drill-down matches the canonical counterparty; the caller sets
                // the direction (DEBIT for spending lists, CREDIT for income sources).
                .filter(t -> cpKey == null || matchesCounterparty(t, cpKey))
                .toList();
    }

    // Match a transaction to a (canonicalized) counterparty group so a drill-down from a
    // merged merchant/UPI row returns exactly that row's transactions — not a fuzzy text match.
    // Matches on the canonical merchant key only; a substring match on the description would
    // over-count payment rails (e.g. every "UPI/PAYTM/..." row), which is the bug we're fixing.
    private boolean matchesCounterparty(Transaction t, String cpKey) {
        return AnalyticsService.canonicalCounterparty(Objects.toString(t.getMerchant(), "")).equals(cpKey);
    }

    private boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q.toLowerCase(Locale.ROOT));
    }

    private String csv(Object x) {
        String value = Objects.toString(x, "").replace("\"", "\"\"");
        return "\"" + value + "\"";
    }
}
