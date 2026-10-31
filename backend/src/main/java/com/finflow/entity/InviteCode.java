package com.finflow.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** A single-use sign-up code (V26). `code` is stored normalised: 12 upper-case letters/digits, no dashes. */
@Entity @Table(name = "invite_codes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InviteCode {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 16, unique = true) private String code;
    @Column(length = 120) private String note;
    @Column(name = "created_by") private String createdBy;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "used_at") private LocalDateTime usedAt;
    @Column(name = "used_by_email") private String usedByEmail;
}
