package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.*;
import java.math.BigDecimal;

@Entity @Table(name = "expenses")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Expense extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String label;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal amount;
    @Column(length = 50) private String category;
    @Column(length = 20) private String frequency = "Monthly";
    @Column(name = "due_day") private Integer dueDay = 1;
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "start_date") private java.time.LocalDate startDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Column(name = "end_date") private java.time.LocalDate endDate;
    @Column(columnDefinition = "TEXT") private String notes;
    private Boolean active = true;
}
