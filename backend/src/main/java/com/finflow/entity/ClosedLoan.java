package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

@Entity @Table(name = "closed_loans")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ClosedLoan {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String lender;
    @Column(length = 200) private String purpose;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal amount;
    @Column(name = "total_paid", precision = 15, scale = 2) private BigDecimal totalPaid;
    @Column(name = "closed_date") private LocalDate closedDate;
    @Column(name = "recovered_amount", precision = 15, scale = 2) private BigDecimal recoveredAmount;
    @Column(name = "asset_type", length = 50) private String assetType; // Loan, Savings, Investment, Insurance, CC EMI
    @Column(name = "interest_paid", precision = 15, scale = 2) private BigDecimal interestPaid;
    @Column(name = "principal_paid", precision = 15, scale = 2) private BigDecimal principalPaid;
    @Column(name = "original_value", precision = 15, scale = 2) private BigDecimal originalValue;
    @Column(name = "closed_months") private Integer closedMonths;
    @Column(columnDefinition = "TEXT") private String notes;
    @Column(name = "funded_by", length = 200) private String fundedBy;
    @Column(name = "funded_amt", precision = 15, scale = 2) private java.math.BigDecimal fundedAmt;
    @Column(name = "current_value", precision = 15, scale = 2) private java.math.BigDecimal currentValue;
    // The frontend's Add/Edit Entry form (ClosedLoansPage.tsx) has had a "Monthly EMI" input since
    // early on, and several calculations there (deriveInt's EMI×months-based interest fallback,
    // verdict()'s _emi) already read `item.emi` back — but no `emi` column ever existed here.
    // Spring Boot's Jackson defaults to fail-on-unknown-properties=false, so every save silently
    // dropped the value instead of erroring, which is why it looked like "saved but not populated"
    // rather than a hard failure.
    @Column(precision = 15, scale = 2) private BigDecimal emi;
    // Same silent-drop bug as `emi` above: the Add/Edit Entry form (ClosedLoansPage.tsx) has had a
    // "Foreclosure Amount" input for a long time (used in the EMI×months+lump total calc and the
    // live P&L preview), sent as `foreclosureAmt` on every save — but no matching column ever
    // existed here, so Jackson's fail-on-unknown-properties=false silently dropped it every time.
    @Column(name = "foreclosure_amt", precision = 15, scale = 2) private BigDecimal foreclosureAmt;
    @Column(name = "created_at") private LocalDateTime createdAt = LocalDateTime.now();
}
