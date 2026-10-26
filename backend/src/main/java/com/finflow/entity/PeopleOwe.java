package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "people_owe")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PeopleOwe extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String person;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal amount;
    @Column(name = "paid_amount", precision = 15, scale = 2) private java.math.BigDecimal paidAmount = java.math.BigDecimal.ZERO;
    @Column(name = "given_date") private LocalDate givenDate;
    @Column(name = "expected_date") private LocalDate expectedDate;
    @Column(length = 20) private String status = "Pending";
    @Column(columnDefinition = "TEXT") private String notes;
}
