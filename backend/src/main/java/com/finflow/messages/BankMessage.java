package com.finflow.messages;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.finflow.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** One bank SMS / alert email and what FinFlow read from it (V28). Money only changes on confirm. */
@Entity @Table(name = "bank_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BankMessage {
    public enum Status { NEW, CONFIRMED, IGNORED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;

    /** sms (iPhone Shortcut) or paste (typed into the app) */
    @Column(nullable = false, length = 10) private String source;
    @Column(length = 40) private String sender;
    @Column(nullable = false, length = 1000) private String body;
    @JsonIgnore @Column(name = "body_hash", nullable = false, columnDefinition = "char(64)") private String bodyHash;
    @Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;

    @Enumerated(EnumType.STRING) @Column(nullable = false, columnDefinition = "varchar(20)") private BankMessageParser.Kind kind;
    @Column(precision = 15, scale = 2) private BigDecimal amount;
    @Column(length = 4) private String last4;
    @Column(length = 60) private String merchant;
    @Column(name = "txn_date") private LocalDate txnDate;
    @Column(name = "due_date") private LocalDate dueDate;
    @Column(name = "min_due", precision = 15, scale = 2) private BigDecimal minDue;
    private Integer tenure;
    @Column(name = "emi_amount", precision = 15, scale = 2) private BigDecimal emiAmount;
    /** Why it was ignored / couldn't be read */
    @Column(length = 200) private String note;

    /** CARD or LOAN, and its id — the match; null when nothing matched */
    @Column(name = "target_type", length = 10) private String targetType;
    @Column(name = "target_id") private Long targetId;
    /** Matched by last 4 digits with a clear amount: pre-selected for "Confirm all" */
    @Column(nullable = false) private boolean sure;

    @Enumerated(EnumType.STRING) @Column(nullable = false, columnDefinition = "varchar(10)") private Status status;
    /** What confirming did, e.g. "Added ₹1,250 spend to HDFC Regalia" */
    @Column(name = "result_note", length = 200) private String resultNote;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
}
