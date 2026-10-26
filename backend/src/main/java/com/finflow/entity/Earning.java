package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity @Table(name = "earnings")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Earning {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(length = 200)
    private String label;

    @Column(name = "monthly_amount", precision = 15, scale = 2)
    private BigDecimal monthlyAmount;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "from_date")
    private LocalDate fromDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "to_date")
    private LocalDate toDate;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
