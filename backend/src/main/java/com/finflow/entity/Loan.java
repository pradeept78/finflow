package com.finflow.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity
@Table(name = "loans")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Loan extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String lender;

    @Column(name = "loan_type", length = 50)
    private String loanType = "Personal Loan";

    @Column(nullable = true, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal emi;

    private Integer tenure;
    private Integer paid = 0;
    private Integer pending = 0;

    @Column(name = "pending_amt", precision = 15, scale = 2)
    private BigDecimal pendingAmt = BigDecimal.ZERO;

    @Column(name = "due_day")
    private Integer dueDay;

    @Column(name = "missed_months")
    private Integer missedMonths = 0;

    @Column(name = "interest_rate", precision = 5, scale = 2)
    private java.math.BigDecimal interestRate;

    @Column(name = "principal_paid", precision = 15, scale = 2)
    private java.math.BigDecimal principalPaid;
    @Column(name = "prepaid_amount", precision = 15, scale = 2) private java.math.BigDecimal prepaidAmount;
    @Column(name = "current_value", precision = 15, scale = 2) private java.math.BigDecimal currentValue;
    @Column(name = "prepaid_note", length = 200) private String prepaidNote;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "start_date")
    private LocalDate startDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "debit_account", length = 150)
    private String debitAccount;

    @Column(name = "processing_fee", precision = 15, scale = 2)
    private BigDecimal processingFee;
}
