package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

@Entity
@Table(name = "card_emis")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CardEmi {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "card_id", nullable = false)
    private CreditCard card;

    @Column(nullable = false, length = 100)
    private String label;

    @Column(precision = 15, scale = 2)
    private BigDecimal principal;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal emi;

    private Integer tenure;
    private Integer paid = 0;
    private Integer pending = 0;

    @Column(name = "missed_months")
    private Integer missedMonths = 0;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "start_date")
    private LocalDate startDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "end_date")
    private LocalDate endDate;

    // What this EMI is actually for — Lifestyle, Insurance, Clothing, etc. Same idea as
    // CardSpend.category, just never existed on EMIs until now; sent as `category` on every save
    // from CreditCardsPage.tsx's EMI form, but silently dropped until this column existed.
    @Column(length = 50)
    private String category;

    // Optional: this EMI was really taken out for someone else, so it's tracked as a receivable
    // separately from what the card itself owes the bank.
    @Column(name = "owed_by", length = 100)
    private String owedBy;

    @Column(name = "owed_settled")
    private Boolean owedSettled = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
