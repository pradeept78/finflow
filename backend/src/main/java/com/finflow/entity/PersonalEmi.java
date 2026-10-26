package com.finflow.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "personal_emis")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PersonalEmi extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Column(nullable = false, length = 100) private String person;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal amount;
    @Column(precision = 15, scale = 2) private BigDecimal emi = BigDecimal.ZERO;
    private Integer tenure;
    private Integer paid = 0;
    private Integer pending = 0;
    @Column(name = "interest_rate", precision = 5, scale = 2) private BigDecimal interestRate = BigDecimal.ZERO;
    @Column(name = "due_day") private Integer dueDay;
    @Column(name = "start_date") private LocalDate startDate;
    @Column(name = "payback_date") private LocalDate paybackDate;
    @Column(columnDefinition = "TEXT") private String notes;
}
