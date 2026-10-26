package com.finflow.analyzer.repo;

import com.finflow.analyzer.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {
    // Scoped by user_id — see the comment on Account.user for why this replaced the original
    // app's global findAll()/findByAccountKey (that app had no login, so nothing scoped anything).
    List<Account> findByUserId(Long userId);
    Optional<Account> findByUserIdAndAccountKey(Long userId, String accountKey);
}
