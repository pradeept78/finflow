package com.finflow.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import lombok.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "credit_cards")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CreditCard extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String banker;

    @Column(name = "card_limit", precision = 15, scale = 2)
    private BigDecimal cardLimit = BigDecimal.ZERO;

    @Column(precision = 15, scale = 2)
    private BigDecimal outstanding = BigDecimal.ZERO;

    @Column(name = "due_day")
    private Integer dueDay;

    // The date `outstanding` was entered — tells the frontend which statement that amount is (the latest
    // one on or before this date). Set by CreditCardService when the amount changes; see V25.
    @Column(name = "outstanding_as_of")
    private java.time.LocalDate outstandingAsOf;

    // The `credit_cards` table has had a `billing_day` column since V1__init_schema.sql, and
    // resolveDueDay() (utils/format.ts) plus QuickLookupPage.tsx already read `c.billingDay` as
    // the card's statement day — but this entity never declared a matching Java field, so Jackson
    // silently dropped it on every save (same failure mode as the missing-column bugs elsewhere in
    // this pass, just on a column that already existed rather than a wholly new one).
    @Column(name = "billing_day")
    private Integer billingDay;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @OneToMany(mappedBy = "card", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    private List<CardEmi> emis = new ArrayList<>();

    @OneToMany(mappedBy = "card", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    private List<CardSpend> spends = new ArrayList<>();
}
