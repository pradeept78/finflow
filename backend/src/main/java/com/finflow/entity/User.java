package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "users")
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(nullable = false)
    private String password;

    // `= "USER"` alone does nothing here: this class also has @Builder, and Lombok's generated
    // builder does NOT apply a field's inline initializer unless the field also carries
    // @Builder.Default — without it, User.builder()...build() (see AuthService.register()) leaves
    // role as null, not "USER". That's the actual cause of new accounts landing with an empty role:
    // the DB column has no NOT NULL constraint (just a DEFAULT that Hibernate's explicit INSERT
    // bypasses), so the null insert succeeds silently, then the null role later breaks Spring
    // Security's UserDetails.builder().roles(role) — which NPEs on a null role — for that account
    // on every future login.
    @Builder.Default
    @Column(nullable = false, length = 20)
    private String role = "USER";

    @Column(name = "last_login")
    private java.time.LocalDateTime lastLogin; // USER or ADMIN

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<Loan> loans;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<CreditCard> creditCards;

    // Any row created before the @Builder.Default fix above still has role = NULL in the database
    // (the fix only changes what NEW builder calls do, it doesn't backfill existing data). Every
    // call site that feeds `role` into Spring Security's UserDetails.builder().roles(...) NPEs on
    // null, which otherwise permanently locks that one account out of login. This is the single
    // place that "null role" gets turned into "USER" — AuthService and SecurityConfig both use it
    // instead of reading `role` directly, so a legacy null row self-heals on next login rather
    // than needing a manual DB backfill.
    public String getRoleOrDefault() {
        return (role != null && !role.isBlank()) ? role : "USER";
    }
}
