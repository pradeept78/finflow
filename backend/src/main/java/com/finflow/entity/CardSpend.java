package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "card_spends")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CardSpend {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "card_id", nullable = false)
    private CreditCard card;

    @Column(nullable = false, length = 200)
    private String purpose;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "spend_date")
    @com.fasterxml.jackson.annotation.JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate spendDate;

    // The Add Spend form (CreditCardsPage.tsx) collects a "Category" select and displays it back
    // in the spends list (`sp.category`), sending it as `category` on every save — but no matching
    // column ever existed here, so Jackson's fail-on-unknown-properties=false silently dropped it.
    @Column(length = 50)
    private String category;

    // Optional: this spend was really for someone else (put on the card on their behalf), so it's
    // tracked as a receivable separately from the card's real outstanding balance.
    @Column(name = "owed_by", length = 100)
    private String owedBy;

    @Column(name = "owed_settled")
    private Boolean owedSettled = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
