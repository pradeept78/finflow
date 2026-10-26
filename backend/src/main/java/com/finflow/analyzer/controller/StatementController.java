package com.finflow.analyzer.controller;

import com.finflow.analyzer.config.ProfileContext;
import com.finflow.analyzer.model.Account;
import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.AccountRepository;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.analyzer.service.StatementParserService;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@RestController
@RequestMapping("/statements")
@RequiredArgsConstructor
public class StatementController {
    private final StatementParserService parser;
    private final TransactionRepository transactionRepo;
    private final AccountRepository accountRepo;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    private Map<String, Integer> buildMapping(Integer dateCol, Integer descCol, Integer debitCol,
                                              Integer creditCol, Integer amountCol, Integer typeCol) {
        Map<String, Integer> m = new LinkedHashMap<>();
        if (dateCol != null) m.put("date", dateCol);
        if (descCol != null) m.put("description", descCol);
        if (debitCol != null) m.put("debit", debitCol);
        if (creditCol != null) m.put("credit", creditCol);
        if (amountCol != null) m.put("amount", amountCol);
        if (typeCol != null) m.put("type", typeCol);
        return m.isEmpty() ? null : m;
    }

    private boolean isTabular(MultipartFile file) {
        String n = Objects.toString(file.getOriginalFilename(), "").toLowerCase();
        return n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls");
    }

    @PostMapping(value = "/inspect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> inspect(@RequestParam("file") MultipartFile file,
                                       @RequestParam(required = false) String password,
                                       @RequestParam(required = false) Integer dateCol,
                                       @RequestParam(required = false) Integer descCol,
                                       @RequestParam(required = false) Integer debitCol,
                                       @RequestParam(required = false) Integer creditCol,
                                       @RequestParam(required = false) Integer amountCol,
                                       @RequestParam(required = false) Integer typeCol) throws Exception {
        Map<String, Integer> mapping = buildMapping(dateCol, descCol, debitCol, creditCol, amountCol, typeCol);
        StatementParserService.ParsedStatement parsed;
        try {
            parsed = parser.parseWithMetadata(file, null, null, null, password, mapping);
        } catch (StatementParserService.EncryptedPdfException e) {
            return Map.of(
                    "file", Objects.toString(file.getOriginalFilename(), "statement"),
                    "encrypted", true,
                    "passwordRequired", true,
                    "wrongPassword", !e.missingPassword,
                    "message", e.getMessage()
            );
        }
        var a = parsed.account();
        List<Map<String, Object>> preview = new ArrayList<>();
        for (Transaction t : parsed.transactions()) {
            if (preview.size() >= 6) break;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", Objects.toString(t.getTransactionDate(), ""));
            row.put("description", Objects.toString(t.getDescription(), ""));
            row.put("amount", t.getAmount());
            row.put("direction", Objects.toString(t.getDirection(), ""));
            row.put("category", Objects.toString(t.getCategory(), ""));
            preview.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("file", Objects.toString(file.getOriginalFilename(), "statement"));
        result.put("encrypted", false);
        result.put("parsed", parsed.transactions().size());
        result.put("preview", preview);
        if (isTabular(file)) {
            StatementParserService.TabularInfo ti = parser.extractTabular(file);
            result.put("fileKind", "tabular");
            result.put("columns", ti.columns());
            result.put("sampleRows", ti.sampleRows());
            result.put("mapping", mapping != null ? mapping : ti.autoMapping());
        } else {
            result.put("fileKind", "pdf");
            if (parsed.transactions().isEmpty()) {
                result.put("extractedSample", parser.pdfSampleLines(file, password, 60));
            }
        }
        result.put("account", Map.of(
                "bankName", a.bankName(),
                "accountType", a.accountType(),
                "maskedNumber", a.maskedNumber(),
                "accountKey", a.accountKey(),
                "confidence", a.confidence()
        ));
        return result;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String bank,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String number,
            @RequestParam(required = false) String password,
            @RequestParam(required = false) Integer dateCol,
            @RequestParam(required = false) Integer descCol,
            @RequestParam(required = false) Integer debitCol,
            @RequestParam(required = false) Integer creditCol,
            @RequestParam(required = false) Integer amountCol,
            @RequestParam(required = false) Integer typeCol) throws Exception {

        Map<String, Integer> mapping = buildMapping(dateCol, descCol, debitCol, creditCol, amountCol, typeCol);
        StatementParserService.ParsedStatement parsed;
        try {
            parsed = parser.parseWithMetadata(file, bank, type, number, password, mapping);
        } catch (StatementParserService.EncryptedPdfException e) {
            return new LinkedHashMap<>(Map.of(
                    "file", Objects.toString(file.getOriginalFilename(), "statement"),
                    "encrypted", true,
                    "wrongPassword", !e.missingPassword,
                    "added", 0,
                    "duplicates", 0,
                    "parsed", 0,
                    "error", e.getMessage()
            ));
        }
        User user = currentUser();
        var info = parsed.account();
        // Was accountRepo.findByAccountKey(...) — global, so a different user's account with a
        // coincidentally-identical key would have been reused here. Now scoped to (user, key).
        Account account = accountRepo.findByUserIdAndAccountKey(user.getId(), info.accountKey()).orElseGet(() -> accountRepo.save(
                Account.builder()
                        .user(user)
                        .bankName(info.bankName())
                        .accountType(info.accountType())
                        .maskedNumber(info.maskedNumber())
                        .displayName(info.bankName() + " • " + info.accountType().replace('_', ' ') + " " + info.maskedNumber())
                        .accountKey(info.accountKey())
                        .build()
        ));

        String profile = ProfileContext.get();
        int added = 0;
        int duplicate = 0;
        for (Transaction t : parsed.transactions()) {
            t.setUser(user);
            t.setAccount(account.getAccountKey());
            t.setProfile(profile);
            // Dedup within a profile only. "Default" keeps bare fingerprints (matches existing
            // data); other profiles namespace theirs so the same statement can live per-profile.
            if (!ProfileContext.DEFAULT.equals(profile)) {
                t.setFingerprint(t.getFingerprint() + "|" + profile);
            }
            // Was transactionRepo.findByFingerprint(...) — global uniqueness, so two different
            // users' otherwise-unrelated transactions that happened to hash to the same
            // fingerprint (it has no per-user component) would have collided as false duplicates.
            if (transactionRepo.findByUserIdAndFingerprint(user.getId(), t.getFingerprint()).isPresent()) {
                duplicate++;
            } else {
                transactionRepo.save(t);
                added++;
            }
        }

        return new LinkedHashMap<>(Map.of(
                "file", Objects.toString(file.getOriginalFilename(), "statement"),
                "parsed", parsed.transactions().size(),
                "added", added,
                "duplicates", duplicate,
                "account", Map.of(
                        "id", account.getId(),
                        "bankName", account.getBankName(),
                        "accountType", account.getAccountType(),
                        "maskedNumber", account.getMaskedNumber(),
                        "displayName", account.getDisplayName(),
                        "accountKey", account.getAccountKey()
                )
        ));
    }

    @DeleteMapping("/all")
    public Map<String, Object> clearAll() {
        String profile = ProfileContext.get();
        // Was transactionRepo.findAll() — every user's transactions.
        List<Transaction> mine = transactionRepo.findByUserId(currentUser().getId()).stream()
                .filter(t -> profile.equals(ProfileContext.normalize(t.getProfile())))
                .toList();
        transactionRepo.deleteAllInBatch(mine);
        return Map.of("deleted", mine.size());
    }
}
