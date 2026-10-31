package com.finflow.service;

import com.finflow.entity.*;
import com.finflow.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class SnapshotService {

    private final UserRepository userRepository;
    private final LoanRepository loanRepository;
    private final CreditCardRepository creditCardRepository;
    private final PersonalEmiRepository personalEmiRepository;
    private final SavingRepository savingRepository;
    private final InvestmentRepository investmentRepository;
    private final InsurancePolicyRepository insurancePolicyRepository;
    private final IncomeEntryRepository incomeEntryRepository;
    private final ExpenseRepository expenseRepository;
    private final MonthlySnapshotRepository snapshotRepository;
    private final MonthlyPaidMarkRepository paidMarkRepository;

    @Transactional
    public void generateSnapshotsForAllUsers() {
        String prevMonth = LocalDate.now().minusMonths(1)
                .format(DateTimeFormatter.ofPattern("yyyy-MM"));
        List<User> users = userRepository.findAll();
        for (User user : users) {
            try {
                generateSnapshot(user, prevMonth);
            } catch (Exception e) {
                log.error("Failed snapshot for user {}: {}", user.getId(), e.getMessage());
            }
        }
        log.info("Monthly snapshots generated for {} users for {}", users.size(), prevMonth);
    }

    @Transactional
    public MonthlySnapshot generateSnapshot(User user, String monthYear) {
        Long uid = user.getId();

        // Skip if already exists
        if (snapshotRepository.findByUserIdAndMonthYear(uid, monthYear).isPresent()) {
            log.info("Snapshot already exists for user {} month {}", uid, monthYear);
            return snapshotRepository.findByUserIdAndMonthYear(uid, monthYear).get();
        }

        // Loans — compute pending from startDate+tenure (same as frontend getEff)
        List<Loan> loans = loanRepository.findByUserId(uid);
        BigDecimal loanEmi = loans.stream()
                .filter(l -> computePending(l.getStartDate(), l.getTenure(), l.getPaid(), l.getPending(), l.getMissedMonths()) > 0)
                .map(l -> l.getEmi() != null ? l.getEmi() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // CC EMIs + Spends
        List<CreditCard> cards = creditCardRepository.findByUserId(uid);
        BigDecimal ccEmi = BigDecimal.ZERO;
        BigDecimal ccSpends = BigDecimal.ZERO;
        for (CreditCard c : cards) {
            for (CardEmi e : c.getEmis()) {
                if (computePending(e.getStartDate(), e.getTenure(), e.getPaid(), e.getPending(), e.getMissedMonths()) > 0)
                    ccEmi = ccEmi.add(e.getEmi() != null ? e.getEmi() : BigDecimal.ZERO);
            }
            for (CardSpend sp : c.getSpends()) {
                ccSpends = ccSpends.add(sp.getAmount() != null ? sp.getAmount() : BigDecimal.ZERO);
            }
        }

        // Personal EMIs
        List<PersonalEmi> personal = personalEmiRepository.findByUserId(uid);
        BigDecimal persEmi = personal.stream()
                .map(p -> p.getEmi() != null ? p.getEmi() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Savings
        List<Saving> savings = savingRepository.findByUserId(uid);
        BigDecimal savEmi = savings.stream()
                .filter(v -> computePending(v.getStartDate(), v.getTenure(), v.getPaidMonths(), null, v.getMissedMonths()) > 0)
                .map(v -> v.getMonthly() != null ? v.getMonthly() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Insurance
        List<InsurancePolicy> insurance = insurancePolicyRepository.findByUserId(uid);
        BigDecimal insEmi = BigDecimal.ZERO;
        for (InsurancePolicy p : insurance) {
            if (p.getActive() == Boolean.FALSE) continue;
            LocalDate ped = p.getPaymentEndDate() != null ? p.getPaymentEndDate() : p.getEndDate();
            if (ped != null && ped.isBefore(LocalDate.now())) continue;
            int freqMo = switch (p.getFrequency() != null ? p.getFrequency() : "Yearly") {
                case "Monthly" -> 1; case "Quarterly" -> 3; case "Half_Yearly" -> 6; default -> 12;
            };
            if (p.getPremium() != null)
                insEmi = insEmi.add(p.getPremium().divide(BigDecimal.valueOf(freqMo), 2, RoundingMode.HALF_UP));
        }

        // SIP
        List<Investment> investments = investmentRepository.findByUserId(uid);
        BigDecimal sipEmi = investments.stream()
                .filter(v -> v.getMonthly() != null && v.getMonthly().compareTo(BigDecimal.ZERO) > 0)
                .map(Investment::getMonthly)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Expenses
        List<IncomeEntry> incomes = incomeEntryRepository.findByUserId(uid);
        List<Expense> expenses = expenseRepository.findByUserId(uid);
        BigDecimal expMo = expenses.stream()
                .filter(e -> e.getActive() != Boolean.FALSE)
                .map(e -> e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalIncome = incomes.stream()
                .filter(i -> i.getActive() != Boolean.FALSE)
                .map(i -> i.getAmount() != null ? i.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalOutflow = loanEmi.add(ccEmi).add(ccSpends).add(persEmi).add(savEmi).add(insEmi).add(sipEmi).add(expMo);
        BigDecimal freeCash = totalIncome.subtract(totalOutflow);

        // Debt — use pendingAmt if set, else estimate from pending months * emi as proxy
        BigDecimal totalDebt = loans.stream().map(l -> {
            if (l.getPendingAmt() != null && l.getPendingAmt().compareTo(BigDecimal.ZERO) > 0)
                return l.getPendingAmt();
            // Estimate: pending months * emi (rough but better than 0)
            int pendingMo = computePending(l.getStartDate(), l.getTenure(), l.getPaid(), l.getPending(), l.getMissedMonths());
            BigDecimal emi = l.getEmi() != null ? l.getEmi() : BigDecimal.ZERO;
            // Use principal remaining: amount - (paid months / tenure) * amount
            if (l.getAmount() != null && l.getTenure() != null && l.getTenure() > 0) {
                int paid = l.getTenure() - pendingMo;
                return l.getAmount().multiply(BigDecimal.valueOf(pendingMo)).divide(BigDecimal.valueOf(l.getTenure()), 2, RoundingMode.HALF_UP);
            }
            return emi.multiply(BigDecimal.valueOf(pendingMo));
        }).reduce(BigDecimal.ZERO, BigDecimal::add);
        totalDebt = totalDebt.add(cards.stream().map(c -> c.getOutstanding() != null ? c.getOutstanding() : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add));
        // Add I Owe (personal EMI principal) to total debt
        totalDebt = totalDebt.add(personal.stream().map(p -> p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add));

        // Paid marks this month
        List<MonthlyPaidMark> marks = paidMarkRepository.findByUserIdAndMonthYear(uid, monthYear);

        MonthlySnapshot snap = MonthlySnapshot.builder()
                .user(user)
                .monthYear(monthYear)
                .totalOutflow(totalOutflow)
                .loanEmi(loanEmi).ccEmi(ccEmi).ccSpends(ccSpends)
                .savingsEmi(savEmi).insuranceEmi(insEmi).sipEmi(sipEmi)
                .personalEmi(persEmi).expenses(expMo)
                .totalDebt(totalDebt).freeCash(freeCash)
                .itemsPaid(marks.size())
                .build();

        return snapshotRepository.save(snap);
    }

    @Transactional
    public MonthlySnapshot generateOrUpdate(User user, String monthYear) {
        return generateOrUpdate(user, monthYear, null);
    }

    /** Refresh a month's snapshot. Net worth is never computed here (see SnapshotController); a refresh
     *  without one keeps the value already recorded instead of resetting it to zero. */
    @Transactional
    public MonthlySnapshot generateOrUpdate(User user, String monthYear, BigDecimal netWorth) {
        var existing = snapshotRepository.findByUserIdAndMonthYear(user.getId(), monthYear);
        BigDecimal keep = netWorth != null ? netWorth : existing.map(MonthlySnapshot::getNetWorth).orElse(null);
        // Delete existing snapshot for this month (allows refresh)
        existing.ifPresent(snapshotRepository::delete);
        snapshotRepository.flush();
        MonthlySnapshot snap = generateSnapshot(user, monthYear);
        if (keep != null) {
            snap.setNetWorth(keep);
            snap = snapshotRepository.save(snap);
        }
        return snap;
    }

    public List<MonthlySnapshot> getLast6Months(Long userId) {
        return snapshotRepository.findTop6ByUserIdOrderByMonthYearDesc(userId);
    }

    public List<MonthlySnapshot> getAll(Long userId) {
        return snapshotRepository.findByUserIdOrderByMonthYearDesc(userId);
    }

    /**
     * Restore historical snapshots from a backup export. Unlike generateSnapshot (which recomputes
     * figures from today's live data), this trusts the backed-up values as-is — they are the only
     * record of a past month's numbers, since live data has since moved on. Same delete-then-save
     * upsert pattern as generateOrUpdate, keyed by monthYear, so re-importing the same backup twice
     * is safe (idempotent) rather than creating duplicate rows per month.
     */
    @Transactional
    public int restoreSnapshots(User user, List<MonthlySnapshot> snapshots) {
        int count = 0;
        for (MonthlySnapshot incoming : snapshots) {
            if (incoming.getMonthYear() == null || incoming.getMonthYear().isBlank()) continue;
            snapshotRepository.findByUserIdAndMonthYear(user.getId(), incoming.getMonthYear())
                    .ifPresent(snapshotRepository::delete);
            incoming.setId(null);
            incoming.setUser(user);
            snapshotRepository.save(incoming);
            count++;
        }
        return count;
    }

    /**
     * Compute pending months — mirrors frontend getEff().
     * If startDate + tenure available, calculate from date. Otherwise fall back to stored pending field.
     */
    private int computePending(LocalDate startDate, Integer tenure, Integer storedPaid, Integer storedPending, Integer missedMonths) {
        if (startDate != null && tenure != null && tenure > 0) {
            LocalDate now = LocalDate.now();
            int monthsElapsed = (now.getYear() - startDate.getYear()) * 12
                    + (now.getMonthValue() - startDate.getMonthValue());
            // If today is before the due day, current month's EMI not yet counted
            // (simplified — matches frontend calcPaidFromDate logic)
            int missed = missedMonths != null ? missedMonths : 0;
            int paid = Math.min(Math.max(0, monthsElapsed - missed), tenure);
            return Math.max(0, tenure - paid);
        }
        // Fallback: use stored pending, or if both null use tenure
        if (storedPending != null && storedPending > 0) return storedPending;
        if (storedPaid != null && tenure != null) return Math.max(0, tenure - storedPaid);
        return tenure != null ? tenure : 0;
    }

}