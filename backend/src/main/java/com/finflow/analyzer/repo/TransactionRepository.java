package com.finflow.analyzer.repo;

import com.finflow.analyzer.model.Transaction;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface TransactionRepository extends JpaRepository<Transaction, Long>, JpaSpecificationExecutor<Transaction> {
    // Scoped by user_id — see the comment on Transaction.user. Every controller/service that used
    // to call findAll() and filter by ProfileContext in Java now fetches only the current user's
    // rows here first; the existing profile/date-range/search filtering downstream is unchanged.
    List<Transaction> findByUserId(Long userId);
    List<Transaction> findByUserId(Long userId, Sort sort);
    Optional<Transaction> findByUserIdAndFingerprint(Long userId, String fingerprint);
    // For single-row PATCH/DELETE by id: without this, a request naming another user's numeric
    // transaction id would find and mutate/delete it — findById() alone doesn't check ownership.
    Optional<Transaction> findByIdAndUserId(Long id, Long userId);
    boolean existsByIdAndUserId(Long id, Long userId);

    // Declared (not currently called anywhere, same as in the original app) but scoped for safety
    // rather than left as a global, cross-user-capable bulk delete.
    long deleteByUserIdAndSourceFileAndAccount(Long userId, String sourceFile, String account);
}
