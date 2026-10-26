package com.finflow.analyzer.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.finflow.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "transactions",
       indexes = {
           @Index(name = "idx_txn_date", columnList = "transactionDate"),
           @Index(name = "idx_txn_category", columnList = "category"),
           @Index(name = "idx_txn_user_fingerprint", columnList = "user_id, fingerprint", unique = true),
           @Index(name = "idx_txn_account", columnList = "account"),
           @Index(name = "idx_txn_user", columnList = "user_id")
       })
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Transaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Merged in from the standalone Statement Analyzer app, which had no login — isolation there
    // was a passwordless "X-Profile" header only. Every transaction now belongs to a real
    // finflow-clean user; `profile` below is kept as an optional sub-label *within* that user's own
    // data (e.g. "Default"/"Business"), not a security boundary. The fingerprint uniqueness index
    // above is (user_id, fingerprint), not fingerprint alone — fingerprint is built from
    // date/description/amount/direction/account only (see StatementParserService), with no
    // per-user component, so two different users could otherwise collide on the same fingerprint
    // and have a legitimate import silently rejected as a "duplicate" of someone else's data.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    private LocalDate transactionDate;

    @Column(length = 1000)
    private String description;

    @Column(length = 500)
    private String merchant;

    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(length = 20)
    private String direction; // DEBIT/CREDIT

    @Column(length = 100)
    private String category;

    @Column(length = 100)
    private String subCategory;

    @Column(length = 40)
    private String transactionType; // SPENDING/INCOME/TRANSFER/REFUND/FEE/EMI/OTHER

    @Column(length = 150)
    private String account;

    @Column(length = 100)
    private String profile; // owner sub-profile within the user; null = "Default"

    @Column(length = 100)
    private String sourceFile;

    @Column(length = 200)
    private String fingerprint;

    private boolean recurring;
    private boolean excludedFromSpend;

    // Manual debt link (Debt Matching page): lets the user point a transaction at a specific Loan,
    // CreditCard, or ClosedLoan when the auto name/amount matcher can't find it on its own.
    // Single-column model — at most one debt per transaction. No FK/JoinColumn here on purpose:
    // linked_debt_id can refer to the loans, credit_cards, or closed_loans table depending on
    // linkedDebtType, and all of those rows live and get archived independently of this one (see
    // V22 migration comment).
    @Column(name = "linked_debt_type", length = 10)
    private String linkedDebtType; // "LOAN", "CARD", or "CLOSED"; null = not linked

    @Column(name = "linked_debt_id")
    private Long linkedDebtId;
}
