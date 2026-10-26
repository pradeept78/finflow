package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "savings")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Saving extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String name;
    @Column(name = "saving_type", length = 50) private String savingType;
    @Column(length = 20) private String mode = "saving";
    @Column(name = "chit_value", precision = 15, scale = 2) private BigDecimal chitValue;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal monthly;
    @Column(nullable = false) private Integer tenure;
    @Column(name = "paid_months") private Integer paidMonths = 0;
    @Column(name = "double_payments") private Integer doublePayments = 0;
    @Column(name = "missed_months") private Integer missedMonths = 0;
    @Column(name = "actual_received", precision = 15, scale = 2) private BigDecimal actualReceived;
    @Column(name = "prize_taken") private Boolean prizeTaken = false;
    @Column(name = "prize_month") private Integer prizeMonth;
    @Column(name = "start_date") private LocalDate startDate;
    @Column(name = "end_date") private LocalDate endDate;
    @Column(columnDefinition = "TEXT") private String notes;
}
