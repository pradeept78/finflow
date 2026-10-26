package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "monthly_snapshots")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MonthlySnapshot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User user;

    @Column(name = "month_year", nullable = false, length = 7)
    private String monthYear; // YYYY-MM

    @Column(name = "total_outflow", precision = 15, scale = 2)
    private BigDecimal totalOutflow = BigDecimal.ZERO;

    @Column(name = "loan_emi", precision = 15, scale = 2)
    private BigDecimal loanEmi = BigDecimal.ZERO;

    @Column(name = "cc_emi", precision = 15, scale = 2)
    private BigDecimal ccEmi = BigDecimal.ZERO;

    @Column(name = "cc_spends", precision = 15, scale = 2)
    private BigDecimal ccSpends = BigDecimal.ZERO;

    @Column(name = "savings_emi", precision = 15, scale = 2)
    private BigDecimal savingsEmi = BigDecimal.ZERO;

    @Column(name = "insurance_emi", precision = 15, scale = 2)
    private BigDecimal insuranceEmi = BigDecimal.ZERO;

    @Column(name = "sip_emi", precision = 15, scale = 2)
    private BigDecimal sipEmi = BigDecimal.ZERO;

    @Column(name = "personal_emi", precision = 15, scale = 2)
    private BigDecimal personalEmi = BigDecimal.ZERO;

    @Column(name = "expenses", precision = 15, scale = 2)
    private BigDecimal expenses = BigDecimal.ZERO;

    @Column(name = "total_debt", precision = 15, scale = 2)
    private BigDecimal totalDebt = BigDecimal.ZERO;

    @Column(name = "net_worth", precision = 15, scale = 2)
    private BigDecimal netWorth = BigDecimal.ZERO;

    @Column(name = "free_cash", precision = 15, scale = 2)
    private BigDecimal freeCash = BigDecimal.ZERO;

    @Column(name = "items_paid")
    private Integer itemsPaid = 0;

    @Column(name = "items_total")
    private Integer itemsTotal = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
