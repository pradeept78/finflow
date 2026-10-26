package com.finflow.analyzer.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.finflow.entity.User;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "accounts", uniqueConstraints = @UniqueConstraint(name = "uk_account_user_key", columnNames = {"user_id", "accountKey"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Account {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Merged in from the standalone Statement Analyzer app, which had no login — every account
    // there was global. Scoping by user here is the whole point of the merge: two finflow-clean
    // users importing statements must never see or collide with each other's accounts. The
    // uniqueness constraint above is (user_id, accountKey), not accountKey alone, for the same
    // reason — two different users' real-world accounts could otherwise coincidentally produce
    // the same masked-number-based key.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Column(nullable = false, length = 100)
    private String bankName;

    @Column(nullable = false, length = 30)
    private String accountType; // DEBIT / CREDIT_CARD

    @Column(nullable = false, length = 30)
    private String maskedNumber;

    @Column(nullable = false, length = 220)
    private String displayName;

    @Column(nullable = false, length = 180)
    private String accountKey;
}
