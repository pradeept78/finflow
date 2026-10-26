package com.finflow.analyzer.controller;

import com.finflow.analyzer.config.ProfileContext;
import com.finflow.analyzer.model.Transaction;
import com.finflow.analyzer.repo.TransactionRepository;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

// Path had "/api" stripped — finflow-clean's server.servlet.context-path is already "/api" for the
// whole app, so a controller-level "/api/..." prefix here would have doubled up to "/api/api/...".
@RestController
@RequestMapping("/profiles")
@RequiredArgsConstructor
public class ProfileController {
    private final TransactionRepository transactionRepo;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    /** Distinct profiles that have data for the current user, always including "Default". */
    @GetMapping
    public List<String> profiles() {
        Set<String> set = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        set.add(ProfileContext.DEFAULT);
        // Was transactionRepo.findAll() — every user's transactions, not just this one's, before
        // the merge added real per-user scoping.
        for (Transaction t : transactionRepo.findByUserId(currentUser().getId())) {
            set.add(ProfileContext.normalize(t.getProfile()));
        }
        List<String> out = new ArrayList<>(set);
        out.sort((a, b) -> a.equalsIgnoreCase(ProfileContext.DEFAULT) ? -1
                : b.equalsIgnoreCase(ProfileContext.DEFAULT) ? 1 : a.compareToIgnoreCase(b));
        return out;
    }
}
