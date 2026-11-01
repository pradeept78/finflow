package com.finflow.messages;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface BankMessageRepository extends JpaRepository<BankMessage, Long> {
    List<BankMessage> findByUserIdOrderByReceivedAtDesc(Long userId);
    Optional<BankMessage> findByIdAndUserId(Long id, Long userId);
    Optional<BankMessage> findByUserIdAndBodyHash(Long userId, String bodyHash);
    long countByUserIdAndStatus(Long userId, BankMessage.Status status);
    long countByUserIdAndCreatedAtAfter(Long userId, LocalDateTime after);
}
