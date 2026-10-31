package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.Earning;
import com.finflow.entity.IncomeEntry;
import com.finflow.entity.User;
import com.finflow.repository.EarningRepository;
import com.finflow.repository.IncomeEntryRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

@RestController
@RequestMapping("/earnings")
@RequiredArgsConstructor
public class EarningController {

    private final EarningRepository repository;
    private final UserRepository userRepository;
    private final IncomeEntryRepository incomeRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Earning>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(repository.findByUserId(currentUser().getId())));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Earning>> create(@RequestBody Earning entity) {
        User user = currentUser();
        entity.setId(null);
        entity.setUser(user);
        Earning saved = repository.save(entity);
        syncLatestToIncome(user);
        return ResponseEntity.ok(ApiResponse.ok("Created", saved));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Earning>> update(@PathVariable Long id, @RequestBody Earning updated) {
        User user = currentUser();
        Earning existing = repository.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
        existing.setLabel(updated.getLabel());
        existing.setMonthlyAmount(updated.getMonthlyAmount());
        existing.setFromDate(updated.getFromDate());
        existing.setToDate(updated.getToDate());
        existing.setNotes(updated.getNotes());
        Earning saved = repository.save(existing);
        syncLatestToIncome(user);
        return ResponseEntity.ok(ApiResponse.ok("Updated", saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        User user = currentUser();
        Earning existing = repository.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
        repository.delete(existing);
        syncLatestToIncome(user);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }

    /**
     * After any Earning change, find the latest active earning (highest fromDate or createdAt)
     * and upsert it into income_entries as the "Salary / Primary Income" source.
     * Other income entries (rent, freelance etc) are left untouched.
     */
    private void syncLatestToIncome(User user) {
        List<Earning> all = repository.findByUserId(user.getId());
        if (all.isEmpty()) return;

        // Pick latest: prefer entries with no toDate (active), sort by fromDate desc then createdAt desc
        Earning latest = all.stream()
                .filter(e -> e.getToDate() == null)
                .max(Comparator.comparing((Earning e) ->
                        e.getFromDate() != null ? e.getFromDate() : e.getCreatedAt().toLocalDate()))
                .orElseGet(() ->
                        // All have toDate — pick the one with highest fromDate/createdAt anyway
                        all.stream()
                                .max(Comparator.comparing((Earning e) ->
                                        e.getFromDate() != null ? e.getFromDate() : e.getCreatedAt().toLocalDate()))
                                .orElse(null));

        if (latest == null || latest.getMonthlyAmount() == null) return;

        String syncLabel = (latest.getLabel() != null && !latest.getLabel().isBlank())
                ? latest.getLabel() : "Salary / Primary Income";

        // Find existing EARNINGS_SYNC income entry or create new one
        IncomeEntry syncEntry = incomeRepository.findByUserIdAndIncomeType(user.getId(), "EARNINGS_SYNC")
                .orElseGet(() -> {
                    IncomeEntry e = new IncomeEntry();
                    e.setUser(user);
                    e.setIncomeType("EARNINGS_SYNC");
                    e.setFrequency("Monthly");
                    e.setActive(true);
                    return e;
                });

        syncEntry.setLabel(syncLabel);
        syncEntry.setAmount(latest.getMonthlyAmount());
        syncEntry.setStartDate(latest.getFromDate());
        syncEntry.setActive(true);
        incomeRepository.save(syncEntry);
    }
}
