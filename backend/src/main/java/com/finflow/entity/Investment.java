package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "investments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Investment extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String name;
    @Column(name = "invest_type", length = 50) private String investType;
    @Column(precision = 15, scale = 2) private BigDecimal monthly = BigDecimal.ZERO;
    @Column(name = "start_date") private LocalDate startDate;
    private Integer tenure;
    @Column(name = "total_invested", precision = 15, scale = 2) private BigDecimal totalInvested = BigDecimal.ZERO;
    @Column(name = "current_value", precision = 15, scale = 2) private BigDecimal currentValue = BigDecimal.ZERO;
    @Column(name = "missed_months") private Integer missedMonths = 0;
    @Column(columnDefinition = "TEXT") private String notes;
    @Column(name = "end_date") private java.time.LocalDate endDate;
    @Column(name = "maturity_value", precision = 15, scale = 2) private java.math.BigDecimal maturityValue;
}
