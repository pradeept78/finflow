package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "income_entries")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class IncomeEntry extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String label;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal amount;
    @Column(name = "income_type", length = 50) private String incomeType;
    @Column(length = 20) private String frequency = "Monthly";
    @Column(name = "start_date") private LocalDate startDate;
    @Column(name = "next_increment_date") private LocalDate nextIncrementDate;
    @Column(name = "next_increment_pct", precision = 5, scale = 2) private BigDecimal nextIncrementPct;
    @Column(columnDefinition = "TEXT") private String notes;
    private Boolean active = true;
}
