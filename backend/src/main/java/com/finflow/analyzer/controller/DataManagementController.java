package com.finflow.analyzer.controller;

import com.finflow.analyzer.config.ProfileContext;
import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.analyzer.service.AnalyticsService;
import com.finflow.analyzer.service.CategoryService;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/data-management")
@RequiredArgsConstructor
public class DataManagementController {
    private final TransactionRepository transactionRepo;
    private final CategoryService categoryService;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    private boolean inProfile(Transaction t) {
        return ProfileContext.get().equals(ProfileContext.normalize(t.getProfile()));
    }

    /**
     * Re-run classification over all stored transactions so existing data picks up
     * improved category / transfer / card-payment rules without re-importing.
     * Updates category, subCategory, transactionType and excludedFromSpend in place.
     */
    @PostMapping("/reclassify")
    public Map<String, Object> reclassify() {
        // Was transactionRepo.findAll() — every user's transactions.
        List<Transaction> all = transactionRepo.findByUserId(currentUser().getId()).stream().filter(this::inProfile).toList();
        int updated = 0;
        for (Transaction t : all) {
            CategoryService.Classification c =
                    categoryService.classify(t.getDescription(), t.getDirection(), t.getAccount());
            boolean changed = !Objects.equals(t.getCategory(), c.category())
                    || !Objects.equals(t.getSubCategory(), c.subCategory())
                    || !Objects.equals(t.getTransactionType(), c.transactionType())
                    || t.isExcludedFromSpend() != c.excludedFromSpend();
            if (changed) {
                t.setCategory(c.category());
                t.setSubCategory(c.subCategory());
                t.setTransactionType(c.transactionType());
                t.setExcludedFromSpend(c.excludedFromSpend());
                updated++;
            }
        }
        transactionRepo.saveAll(all);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", all.size());
        result.put("updated", updated);
        return result;
    }

    @GetMapping("/years")
    public List<Map<String, Object>> years() {
        Map<Integer, List<Transaction>> grouped = transactionRepo.findByUserId(currentUser().getId(), Sort.by("transactionDate", "id")).stream()
                .filter(this::inProfile)
                .filter(t -> t.getTransactionDate() != null)
                .collect(Collectors.groupingBy(t -> t.getTransactionDate().getYear(), TreeMap::new, Collectors.toList()));

        List<Map<String, Object>> result = new ArrayList<>();
        grouped.forEach((year, txs) -> {
            BigDecimal spending = txs.stream().filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend())
                    .map(Transaction::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal income = AnalyticsService.moneyIn(txs);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("year", year);
            row.put("transactions", txs.size());
            row.put("spending", spending);
            row.put("income", income);
            row.put("accounts", txs.stream().map(Transaction::getAccount).filter(Objects::nonNull).distinct().count());
            result.add(row);
        });
        result.sort(Comparator.comparingInt(x -> (Integer) x.get("year")));
        return result;
    }

    @GetMapping("/statements")
    public List<Map<String, Object>> statements() {
        Map<String, List<Transaction>> grouped = transactionRepo.findByUserId(currentUser().getId(), Sort.by(Sort.Direction.DESC, "transactionDate", "id")).stream()
                .filter(this::inProfile)
                .filter(t -> t.getSourceFile() != null && !t.getSourceFile().isBlank())
                .collect(Collectors.groupingBy(t -> Objects.toString(t.getSourceFile(), ""), LinkedHashMap::new, Collectors.toList()));

        List<Map<String, Object>> result = new ArrayList<>();
        grouped.forEach((file, txs) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("sourceFile", file);
            row.put("transactions", txs.size());
            row.put("account", txs.stream().map(Transaction::getAccount).filter(Objects::nonNull).findFirst().orElse(""));
            row.put("from", txs.stream().map(Transaction::getTransactionDate).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null));
            row.put("to", txs.stream().map(Transaction::getTransactionDate).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null));
            result.add(row);
        });
        return result;
    }

    @GetMapping("/years/{year}")
    public Map<String, Object> year(@PathVariable int year, @RequestParam(required = false) String account) {
        List<Transaction> txs = transactionRepo.findByUserId(currentUser().getId(), Sort.by(Sort.Direction.DESC, "transactionDate", "id")).stream()
                .filter(this::inProfile)
                .filter(t -> t.getTransactionDate() != null && t.getTransactionDate().getYear() == year)
                .filter(t -> account == null || account.isBlank() || account.equals(t.getAccount()))
                .toList();
        BigDecimal spending = txs.stream().filter(t -> "DEBIT".equals(t.getDirection()) && !t.isExcludedFromSpend()).map(Transaction::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal income = AnalyticsService.moneyIn(txs);
        return new LinkedHashMap<>(Map.of("year", year, "transactions", txs.size(), "spending", spending, "income", income,
                "netCashFlow", income.subtract(spending), "accounts", txs.stream().map(Transaction::getAccount).filter(Objects::nonNull).distinct().toList()));
    }

    @DeleteMapping("/years/{year}")
    public Map<String, Object> deleteYear(@PathVariable int year, @RequestParam(required = false) String account) {
        List<Transaction> txs = transactionRepo.findByUserId(currentUser().getId()).stream()
                .filter(this::inProfile)
                .filter(t -> t.getTransactionDate() != null && t.getTransactionDate().getYear() == year)
                .filter(t -> account == null || account.isBlank() || account.equals(t.getAccount()))
                .toList();
        long count = txs.size();
        transactionRepo.deleteAllInBatch(txs);
        return Map.of("year", year, "deleted", count);
    }

    @DeleteMapping("/statements")
    public Map<String, Object> deleteStatement(@RequestParam String sourceFile, @RequestParam(required = false) String account) {
        List<Transaction> txs = transactionRepo.findByUserId(currentUser().getId()).stream()
                .filter(this::inProfile)
                .filter(t -> sourceFile.equals(t.getSourceFile()))
                .filter(t -> account == null || account.isBlank() || account.equals(t.getAccount()))
                .toList();
        long count = txs.size();
        transactionRepo.deleteAllInBatch(txs);
        return Map.of("sourceFile", sourceFile, "deleted", count);
    }
}
