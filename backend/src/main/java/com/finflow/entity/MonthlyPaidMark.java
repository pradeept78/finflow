package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.time.LocalDateTime;

@Entity @Table(name = "monthly_paid_marks")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MonthlyPaidMark {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(name = "item_key", nullable = false, length = 100) private String itemKey;
    @Column(name = "month_year", nullable = false, length = 7) private String monthYear;
    @Column(name = "created_at") private LocalDateTime createdAt = LocalDateTime.now();
}
