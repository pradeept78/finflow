package com.finflow.analyzer.controller;

import com.finflow.analyzer.config.ProfileContext;
import com.finflow.analyzer.model.Account;
import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.AccountRepository;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/accounts")
@RequiredArgsConstructor
public class AccountController {
    private final AccountRepository repo;
    private final TransactionRepository transactionRepo;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    // Only accounts used by the active profile's transactions, scoped to the current user
    // (was findAll() on both repos — every user's accounts and transactions before the merge).
    @GetMapping
    public List<Account> list() {
        Long userId = currentUser().getId();
        String profile = ProfileContext.get();
        Set<String> keys = transactionRepo.findByUserId(userId).stream()
                .filter(t -> profile.equals(ProfileContext.normalize(t.getProfile())))
                .map(Transaction::getAccount).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        return repo.findByUserId(userId).stream()
                .filter(a -> keys.contains(a.getAccountKey()))
                .toList();
    }
}
