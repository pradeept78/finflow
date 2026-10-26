package com.finflow.entity;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity @Table(name = "insurance_policies")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InsurancePolicy extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String name;
    // The Add/Edit Policy form (InsurancePage.tsx) collects "Insurer / Provider", "Policy Term
    // (years)" and "Payment Term (years)" — all displayed back on the expanded row — sending them
    // as `insurer`/`termYears`/`paymentTermYears` on every save. None of these columns ever
    // existed here, so Jackson's fail-on-unknown-properties=false silently dropped all three.
    @Column(length = 100) private String insurer;
    @Column(name = "policy_type", length = 50) private String policyType;
    @Column(nullable = false, precision = 15, scale = 2) private BigDecimal premium;
    @Column(length = 20) private String frequency = "Yearly";
    @Column(name = "start_date") private LocalDate startDate;
    @Column(name = "payment_end_date") private LocalDate paymentEndDate;
    @Column(name = "end_date") private LocalDate endDate;
    @Column(name = "sum_assured", precision = 15, scale = 2) private BigDecimal sumAssured;
    @Column(name = "last_paid_date") private LocalDate lastPaidDate;
    @Column(name = "term_years") private Integer termYears;
    @Column(name = "payment_term_years") private Integer paymentTermYears;
    // "Card Link" section on the Add/Edit form (InsurancePage.tsx): which card this premium is paid
    // on, whether it's already being paid off as that card's own EMI (in which case its cost must be
    // excluded from every Insurance outflow total — it's already counted once, as the card's CC EMI),
    // and which specific CardEmi row it maps to. Plain id columns rather than @ManyToOne: nothing on
    // the backend ever needs to load the related CreditCard/CardEmi, the frontend already has both
    // lists loaded and does its own lookup by id — same reference-only style as `insurer` etc. above,
    // none of these three existed as columns either, so Jackson silently dropped them on every save.
    @Column(name = "paid_by_card_id") private Long paidByCardId;
    // Named `cardEmi` (not `isCardEmi`) on purpose: Lombok does not prepend "get" to a Boolean field
    // already starting with "is" (it reuses the field name as the getter, e.g. `isCardEmi()`), and
    // Jackson then strips that same "is" prefix when deriving the JSON property name from a boolean
    // getter — the two conventions fight each other and the field would silently serialize as
    // "cardEmi" instead of "isCardEmi", which is exactly what the frontend sends and reads. Forcing
    // the wire name explicitly with `@JsonProperty` sidesteps that clash entirely.
    @JsonProperty("isCardEmi")
    @Column(name = "is_card_emi") private Boolean cardEmi = false;
    @Column(name = "linked_emi_id") private Long linkedEmiId;
    @Column(columnDefinition = "TEXT") private String notes;
    private Boolean active = true;
}
