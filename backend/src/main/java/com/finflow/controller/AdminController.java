package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.User;
import com.finflow.repository.*;
import com.finflow.repository.IncomeEntryRepository;
import com.finflow.entity.Earning;
import com.finflow.service.SnapshotService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.*;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminController {
    @org.springframework.beans.factory.annotation.Autowired
    private JdbcTemplate jdbcTemplate;

    private final UserRepository userRepository;
    private final LoanRepository loanRepository;
    private final CreditCardRepository creditCardRepository;
    private final PersonalEmiRepository personalEmiRepository;
    private final SavingRepository savingRepository;
    private final InvestmentRepository investmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final SnapshotService snapshotService;
    private final EarningRepository earningRepository;
    private final ClosedLoanRepository closedLoanRepository;
    private final IncomeEntryRepository incomeEntryRepository;
    // Added for /users/{id}/commitments below — every other repository this controller needs
    // (loans/cards/personal/savings/investments) was already injected for the aggregate /users
    // endpoint above; only Expense and Insurance were missing because nothing here used them yet.
    private final ExpenseRepository expenseRepository;
    private final InsurancePolicyRepository insurancePolicyRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    private void requireAdmin() {
        User u = currentUser();
        // Was throwing a plain RuntimeException, which GlobalExceptionHandler maps to HTTP 400 —
        // an authorization failure reporting as a client-input error muddies logs/monitoring for
        // real auth failures vs validation errors. AccessDeniedException gets its own handler
        // mapped to 403, which is what this actually is.
        if (!"ADMIN".equals(u.getRole()))
            throw new org.springframework.security.access.AccessDeniedException("Admin access required");
    }

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getUsers() {
        requireAdmin();
        // The signed-in admin's id, so the UI can disable destructive actions on their own row.
        // This was never sent before: the frontend looked for `isCurrentUser`, found it undefined
        // on every row, and fell back to comparing against an empty string — so the guard never
        // engaged and an admin could demote or delete their own account.
        Long currentId = currentUser().getId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (User u : userRepository.findAll()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", u.getId());
            row.put("name", u.getName());
            row.put("email", u.getEmail());
            row.put("role", u.getRole());
            row.put("isCurrentUser", u.getId() != null && u.getId().equals(currentId));
            row.put("createdAt", u.getCreatedAt());
            row.put("lastLogin", u.getLastLogin());
            // Stats
            row.put("loanCount", loanRepository.findByUserId(u.getId()).size());
            row.put("cardCount", creditCardRepository.findByUserId(u.getId()).size());
            row.put("personalCount", personalEmiRepository.findByUserId(u.getId()).size());
            row.put("savingsCount", savingRepository.findByUserId(u.getId()).size());
            row.put("investmentCount", investmentRepository.findByUserId(u.getId()).size());
            // Loan amounts
            double loanDebt = 0, loanEmi = 0;
            double loanTotalInt = 0, loanIntPaid = 0;
            for (var l : loanRepository.findByUserId(u.getId())) {
                if (l.getEmi() == null || l.getTenure() == null || l.getAmount() == null) continue;
                double ti = Math.max(0, l.getEmi().doubleValue() * l.getTenure() - l.getAmount().doubleValue());
                loanTotalInt += ti;

                // Paid months from startDate (mirrors frontend getEff)
                int paidMonths = 0;
                if (l.getStartDate() != null) {
                    java.time.LocalDate now = java.time.LocalDate.now();
                    java.time.LocalDate sd = l.getStartDate();
                    int elapsed = (now.getYear() - sd.getYear()) * 12 + (now.getMonthValue() - sd.getMonthValue()) + 1;
                    if (now.getDayOfMonth() < sd.getDayOfMonth()) elapsed--;
                    int missed = l.getMissedMonths() != null ? l.getMissedMonths() : 0;
                    paidMonths = Math.min(Math.max(0, elapsed - missed), l.getTenure());
                } else {
                    paidMonths = l.getPaid() != null ? l.getPaid() : 0;
                }
                int pendingMonths = Math.max(0, l.getTenure() - paidMonths);

                // EMI only if still pending
                if (pendingMonths > 0) loanEmi += l.getEmi().doubleValue();

                // principalPaid field stores PRINCIPAL REMAINING (from bank statement)
                // Use amortization to get accurate principal remaining
                double principal = l.getAmount() != null ? l.getAmount().doubleValue() : 0;
                double emi = l.getEmi() != null ? l.getEmi().doubleValue() : 0;
                double rate = l.getInterestRate() != null ? l.getInterestRate().doubleValue() / 100.0 / 12.0 : 0;
                double bal = principal;
                double intPaidCalc = 0;
                for (int m = 0; m < paidMonths; m++) {
                    double ic = rate > 0 ? bal * rate : 0;
                    double pc = Math.max(0, emi - ic);
                    intPaidCalc += ic;
                    bal = Math.max(0, bal - pc);
                }
                // Override with bank-provided principal if available
                if (l.getPrincipalPaid() != null && l.getPrincipalPaid().doubleValue() > 0) {
                    bal = l.getPrincipalPaid().doubleValue();
                }
                loanDebt += bal;
                loanIntPaid += intPaidCalc;
            }
            // CC amounts — exact mirror of frontend calcPaidFromDate
            java.time.LocalDate todayCC = java.time.LocalDate.now();
            double ccOut = 0, ccLimit = 0, ccEmiPending = 0, ccEmiMo = 0, ccSpends = 0;
            for (var card : creditCardRepository.findByUserId(u.getId())) {
                ccOut    += card.getOutstanding() != null ? card.getOutstanding().doubleValue() : 0;
                ccLimit  += card.getCardLimit()   != null ? card.getCardLimit().doubleValue()   : 0;
                if (card.getSpends() != null)
                    for (var s : card.getSpends())
                        ccSpends += s.getAmount() != null ? s.getAmount().doubleValue() : 0;
                if (card.getEmis() == null) continue;
                for (var e : card.getEmis()) {
                    if (e.getTenure() == null || e.getEmi() == null) continue;
                    int paidE;
                    if (e.getStartDate() != null) {
                        java.time.LocalDate sd = e.getStartDate();
                        int elapsed = (todayCC.getYear() - sd.getYear()) * 12
                                    + (todayCC.getMonthValue() - sd.getMonthValue()) + 1;
                        if (todayCC.getDayOfMonth() < sd.getDayOfMonth()) elapsed--;
                        paidE = Math.min(Math.max(0, elapsed), e.getTenure());
                    } else {
                        paidE = e.getPaid() != null ? e.getPaid() : 0;
                    }
                    int pendingE = Math.max(0, e.getTenure() - paidE);
                    ccEmiPending += pendingE * e.getEmi().doubleValue();
                    if (pendingE > 0) ccEmiMo += e.getEmi().doubleValue();
                }
            }
            // Savings
            // Corpus = building savings only (exclude withdrew/prizeTaken = debt repayment)
            // Savings built = building only (not withdrew/prizeTaken) × paid months × monthly
            // mirrors frontend: getEff(v).paid * v.monthly
            double savingsCorpus = savingRepository.findByUserId(u.getId()).stream()
                .filter(v -> !"withdrew".equals(v.getMode()) && !Boolean.TRUE.equals(v.getPrizeTaken()))
                .mapToDouble(v -> {
                    int paid = v.getPaidMonths() != null ? v.getPaidMonths() : 0;
                    // Use startDate-based months if available (mirrors getEff)
                    if (v.getStartDate() != null) {
                        java.time.LocalDate now = java.time.LocalDate.now();
                        java.time.LocalDate start = v.getStartDate();
                        int months = (int)java.time.temporal.ChronoUnit.MONTHS.between(start, now) + 1;
                        int tenure = v.getTenure() != null ? v.getTenure() : 9999;
                        paid = Math.min(Math.max(0, months), tenure);
                    }
                    return v.getMonthly() != null ? paid * v.getMonthly().doubleValue() : 0;
                }).sum();
            // Chit repay remaining = withdrew/prizeTaken pending payments
            // Chit repay remaining = withdrew/prizeTaken pending months × monthly
            // Account for doublePayments (free months covered by surplus)
            /* Mirrors frontend calcPaidFromDate. TIMESTAMPDIFF(MONTH,...) was used here before,
               but it already truncates on day-of-month, and the query then subtracted for the day
               a SECOND time — so any row whose start day falls later in the month than today came
               out one month behind the frontend. That is why Admin reported ₹1,05,000 of chit
               remaining where Hub reported ₹95,000. PERIOD_DIFF gives the pure calendar-month
               difference the JS formula actually counts, so one day adjustment is correct.
               missed_months was also being ignored entirely. */
            // elapsed = months_since_start + 1 (inclusive), minus 1 if today < due_day
            // paid = LEAST(elapsed + double_payments, tenure)
            // pending = tenure - paid
            Double chitRaw = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(monthly * GREATEST(0, tenure - " +
                "LEAST(" +
                "  GREATEST(0, PERIOD_DIFF(DATE_FORMAT(NOW(),'%Y%m'), DATE_FORMAT(start_date,'%Y%m')) " +
                "    + IF(DAY(NOW()) >= DAY(start_date), 1, 0)" +
                "  ) + COALESCE(double_payments, 0) - COALESCE(missed_months, 0)" +
                ", tenure))), 0) " +
                "FROM savings WHERE user_id = ? AND (mode = 'withdrew' OR prize_taken = 1) AND start_date IS NOT NULL",
                Double.class, u.getId());
            Double chitRaw2 = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(monthly * GREATEST(0, tenure - LEAST(GREATEST(0, COALESCE(paid_months,0) + COALESCE(double_payments,0) - COALESCE(missed_months,0)), tenure))), 0) " +
                "FROM savings WHERE user_id = ? AND (mode = 'withdrew' OR prize_taken = 1) AND start_date IS NULL",
                Double.class, u.getId());
            double chitRepayRemaining = (chitRaw != null ? chitRaw : 0) + (chitRaw2 != null ? chitRaw2 : 0);
            // Investments
            double investValue = investmentRepository.findByUserId(u.getId()).stream()
                .mapToDouble(v -> v.getCurrentValue() != null ? v.getCurrentValue().doubleValue() : 0).sum();
            // Personal
            double personalDebt = personalEmiRepository.findByUserId(u.getId()).stream()
                .mapToDouble(p -> p.getAmount() != null ? p.getAmount().doubleValue() : 0).sum();

            row.put("loanDebt", loanDebt);
            row.put("loanEmi", loanEmi);
            row.put("loanTotalInt", loanTotalInt);
            row.put("loanIntPaid", loanIntPaid);
            // Interest remaining = total interest - already paid interest
            // intLeft = EMI × pending months - principal remaining (same as calcLoanSplit)
            double loanIntLeftCalc = 0;
            for (var l : loanRepository.findByUserId(u.getId())) {
                if (l.getEmi() == null || l.getTenure() == null || l.getAmount() == null) continue;
                double emiV = l.getEmi().doubleValue();
                double principalV = l.getAmount().doubleValue();
                double rateV = l.getInterestRate() != null ? l.getInterestRate().doubleValue() / 100.0 / 12.0 : 0;
                int paidV = 0;
                if (l.getStartDate() != null) {
                    java.time.LocalDate now = java.time.LocalDate.now();
                    int elapsed = (now.getYear()-l.getStartDate().getYear())*12 + (now.getMonthValue()-l.getStartDate().getMonthValue()) + 1;
                    if (now.getDayOfMonth() < l.getStartDate().getDayOfMonth()) elapsed--;
                    paidV = Math.min(Math.max(0, elapsed), l.getTenure());
                } else { paidV = l.getPaid() != null ? l.getPaid() : 0; }
                int pendingV = Math.max(0, l.getTenure() - paidV);
                // Run amortization to get balance
                double balV = principalV;
                for (int m = 0; m < paidV; m++) {
                    double ic = rateV > 0 ? balV * rateV : 0;
                    balV = Math.max(0, balV - Math.max(0, emiV - ic));
                }
                if (l.getPrincipalPaid() != null && l.getPrincipalPaid().doubleValue() > 0)
                    balV = l.getPrincipalPaid().doubleValue();
                // intLeft = EMI×pending - principalRemaining
                loanIntLeftCalc += Math.max(0, emiV * pendingV - balV);
            }
            row.put("loanIntLeft", loanIntLeftCalc);
            row.put("ccOutstanding", ccOut);
            row.put("ccEmiPending", ccEmiPending);
            row.put("ccLimit", ccLimit);
            row.put("ccEmiMo", ccEmiMo);
            row.put("ccEmiPending", ccEmiPending);
            row.put("ccSpends", ccSpends);
            // Owned assets = current value of active loans + closed assets
            java.time.LocalDate today = java.time.LocalDate.now();
            double ownedAssets = 0, ownedAssetsPending = 0;
            for (var l : loanRepository.findByUserId(u.getId())) {
                if (l.getCurrentValue() == null) continue;
                ownedAssets += l.getCurrentValue().doubleValue();
                // pending = EMI × pending months (mirrors frontend)
                if (l.getEmi() != null && l.getTenure() != null && l.getStartDate() != null) {
                    java.time.LocalDate sd = l.getStartDate();
                    int elapsed = (today.getYear()-sd.getYear())*12+(today.getMonthValue()-sd.getMonthValue())+1;
                    if (today.getDayOfMonth() < sd.getDayOfMonth()) elapsed--;
                    int paidM = Math.min(Math.max(0,elapsed), l.getTenure());
                    int pendingM = Math.max(0, l.getTenure()-paidM);
                    ownedAssetsPending += pendingM * l.getEmi().doubleValue();
                }
            }
            ownedAssets += closedLoanRepository.findByUserId(u.getId()).stream()
                .mapToDouble(cl -> cl.getCurrentValue() != null ? cl.getCurrentValue().doubleValue() : 0).sum();
            row.put("ownedAssets", ownedAssets);
            row.put("ownedAssetsPending", ownedAssetsPending);
            row.put("ownedAssetsNet", ownedAssets - ownedAssetsPending);
            row.put("savingsCorpus", savingsCorpus);
            row.put("chitRepayRemaining", chitRepayRemaining);
            row.put("investValue", investValue);
            row.put("personalDebt", personalDebt);
            /* Debt summary — must match the frontend definition in utils/calcDebt.ts:
               DEBT IS PRINCIPAL OUTSTANDING. `loanIntLeftCalc` used to be added in here, which is
               why this endpoint reported ₹27,17,835 where every page in the app reported
               ₹24,84,938 for the same user. Interest still to come is the cost of carrying the
               debt, not a present liability, and folding it into net worth double-counts against
               income that has not been earned yet. It is still returned as `loanIntLeft` so the
               admin panel can show it alongside — just never inside the total. */
            double loanIntLeft = Math.max(0, loanTotalInt - loanIntPaid);
            // Matches utils/calcDebt: debt is the total still to pay, so remaining loan interest is
            // included. `totalDebtPrincipal` is the settle-today figure, kept so the panel can show
            // both without either page recomputing one from the other.
            double principalDebt = loanDebt + ccEmiPending + ccOut + personalDebt + chitRepayRemaining; // ccSpends excluded - tracked purchases not debt
            double totalDebtWithInterest = principalDebt + loanIntLeftCalc;
            row.put("totalDebtPrincipal", principalDebt);
            row.put("totalDebt", totalDebtWithInterest);
            double netWorth = (savingsCorpus + investValue + ownedAssets - ownedAssetsPending) - totalDebtWithInterest;
            row.put("netWorth", netWorth);
            row.put("snapshots", snapshotService.getAll(u.getId()).size());
            // Lifetime earnings
            double totalEarned = earningRepository.findByUserId(u.getId()).stream()
                .mapToDouble(e -> {
                    if (e.getMonthlyAmount() == null || e.getFromDate() == null) return 0;
                    java.time.LocalDate end = e.getToDate() != null ? e.getToDate() : java.time.LocalDate.now();
                    int months = (end.getYear() - e.getFromDate().getYear()) * 12
                        + (end.getMonthValue() - e.getFromDate().getMonthValue()) + 1;
                    return Math.max(0, months) * e.getMonthlyAmount().doubleValue();
                }).sum();
            row.put("totalEarned", totalEarned);
            // Monthly income
            double monthlyIncome = incomeEntryRepository.findByUserId(u.getId()).stream()
                .filter(i -> Boolean.TRUE.equals(i.getActive()) || i.getActive() == null)
                .mapToDouble(i -> i.getAmount() != null ? i.getAmount().doubleValue() : 0)
                .sum();
            row.put("monthlyIncome", monthlyIncome);
            row.put("loanEmi", loanEmi);

            // Recurring bills.
            Double expMoRaw = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ? AND (active IS NULL OR active = 1)",
                Double.class, u.getId());
            double expMo = expMoRaw != null ? expMoRaw : 0;

            // Insurance premiums normalised to a monthly figure.
            Double insMoRaw = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(premium / CASE COALESCE(frequency,'Yearly') " +
                "  WHEN 'Monthly' THEN 1 WHEN 'Quarterly' THEN 3 WHEN 'Half-Yearly' THEN 6 " +
                "  WHEN 'Half_Yearly' THEN 6 WHEN 'Yearly' THEN 12 ELSE 12 END), 0) " +
                "FROM insurance_policies WHERE user_id = ? AND (active IS NULL OR active = 1)",
                Double.class, u.getId());
            double insMo = insMoRaw != null ? insMoRaw : 0;

            // Savings/chit instalments still being paid — covers both building and repaying,
            // matching what the app counts in monthly outflow. Progress is derived from
            // start_date the same way chitRepayRemaining above does it, because paid_months
            // alone is not maintained for entries that track by date.
            Double savMoRaw = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(monthly), 0) FROM savings WHERE user_id = ? AND start_date IS NOT NULL " +
                "AND tenure > LEAST(" +
                "  GREATEST(0, PERIOD_DIFF(DATE_FORMAT(NOW(),'%Y%m'), DATE_FORMAT(start_date,'%Y%m')) " +
                "    + IF(DAY(NOW()) >= DAY(start_date), 1, 0)" +
                "  ) + COALESCE(double_payments, 0) - COALESCE(missed_months, 0)" +
                ", tenure)",
                Double.class, u.getId());
            Double savMoRaw2 = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(monthly), 0) FROM savings WHERE user_id = ? AND start_date IS NULL " +
                "AND COALESCE(tenure,0) > COALESCE(paid_months,0) + COALESCE(double_payments,0) - COALESCE(missed_months,0)",
                Double.class, u.getId());
            double savMo = (savMoRaw != null ? savMoRaw : 0) + (savMoRaw2 != null ? savMoRaw2 : 0);

            double sipMo = investmentRepository.findByUserId(u.getId()).stream()
                .mapToDouble(v -> v.getMonthly() != null ? v.getMonthly().doubleValue() : 0).sum();

            double persEmiMo = personalEmiRepository.findByUserId(u.getId()).stream()
                .mapToDouble(p -> p.getEmi() != null ? p.getEmi().doubleValue() : 0).sum();

            // Two tiers, matching how every page in the app now reports outflow.
            //
            // lockedMo is the standing commitment: it repeats identically next month and the
            // user cannot opt out of it. This is the figure Free/Month is measured against.
            //
            // cardThisMonth is a balance, not a commitment — clear it and it is gone. It used
            // to be folded into monthlyOutflow (ccSpends was added in, ccOutstanding was left
            // out entirely), which meant this endpoint could never agree with the Dashboard,
            // Budget, Lookup or Calendar figures, and it inflated the recurring number with a
            // one-off spend.
            double lockedMo       = loanEmi + ccEmiMo + expMo + insMo + savMo + sipMo + persEmiMo;
            double cardThisMonth  = ccOut + ccSpends;
            double monthlyOutflow = lockedMo + cardThisMonth;

            row.put("expenseMo", expMo);
            row.put("insuranceMo", insMo);
            row.put("savingsMo", savMo);
            row.put("sipMo", sipMo);
            row.put("personalEmiMo", persEmiMo);
            row.put("lockedMonthly", lockedMo);
            row.put("cardThisMonth", cardThisMonth);
            row.put("monthlyOutflow", monthlyOutflow);
            // Free cash is income minus the standing commitment. Subtracting the card balance
            // here as well would understate it every month the user clears their card.
            row.put("freeMonth", monthlyIncome - lockedMo);
            result.add(row);
        }
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    /**
     * The per-item counterpart to getUsers() above. That endpoint only ever sends 40 aggregate
     * totals per user (loanDebt, ccEmiMo, etc.) — enough for the summary cards, but there was no
     * way to see WHICH loan or WHICH card EMI those totals were built from for anyone but yourself.
     * This returns the same raw entity lists each feature's own controller already sends the
     * signed-in user (LoanController -> List<Loan>, CreditCardController -> List<CreditCard> with
     * its emis/spends nested, etc.) for an arbitrary user id instead, via the exact same
     * repository.findByUserId(...) call each one's own service makes for "the current user" — so
     * the frontend can run the identical row-building logic /master uses on it. Entities already
     * carry @JsonIgnore on their `user` back-reference, so nothing about one user's account leaks
     * into another's beyond what this endpoint deliberately bundles together.
     */
    @GetMapping("/users/{id}/commitments")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUserCommitments(@PathVariable Long id) {
        requireAdmin();
        userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("loans", loanRepository.findByUserId(id));
        bundle.put("cards", creditCardRepository.findByUserId(id));
        bundle.put("personal", personalEmiRepository.findByUserId(id));
        bundle.put("savings", savingRepository.findByUserId(id));
        bundle.put("investments", investmentRepository.findByUserId(id));
        bundle.put("expenses", expenseRepository.findByUserId(id));
        bundle.put("insurance", insurancePolicyRepository.findByUserId(id));
        bundle.put("income", incomeEntryRepository.findByUserId(id));
        return ResponseEntity.ok(ApiResponse.ok(bundle));
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<ApiResponse<String>> resetPassword(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        requireAdmin();
        String newPassword = body.get("password");
        if (newPassword == null || newPassword.length() < 6)
            throw new RuntimeException("Password must be at least 6 characters");
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok("Password reset for " + user.getEmail(), "ok"));
    }

    private long adminCount() {
        return userRepository.findAll().stream().filter(u -> "ADMIN".equals(u.getRoleOrDefault())).count();
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<ApiResponse<String>> setRole(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        requireAdmin();
        String role = body.get("role");
        if (!List.of("USER", "ADMIN").contains(role)) throw new RuntimeException("Invalid role");
        User user = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        // Lock-out guards: an admin must not be able to demote themselves, and the last remaining
        // admin can never be demoted — otherwise nobody could reach this page again.
        if (!"ADMIN".equals(role)) {
            if (currentUser().getId().equals(id))
                throw new RuntimeException("You cannot remove your own admin access");
            if ("ADMIN".equals(user.getRoleOrDefault()) && adminCount() <= 1)
                throw new RuntimeException("At least one admin must remain");
        }
        user.setRole(role);
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok("Role updated", "ok"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<String>> deleteUser(@PathVariable Long id) {
        requireAdmin();
        User current = currentUser();
        if (current.getId().equals(id)) throw new RuntimeException("Cannot delete yourself");
        User target = userRepository.findById(id).orElseThrow(() -> new RuntimeException("User not found"));
        if ("ADMIN".equals(target.getRoleOrDefault()) && adminCount() <= 1)
            throw new RuntimeException("At least one admin must remain");
        userRepository.deleteById(id);
        return ResponseEntity.ok(ApiResponse.ok("User deleted", "ok"));
    }

    @GetMapping("/me/is-admin")
    public ResponseEntity<ApiResponse<Boolean>> isAdmin() {
        User u = currentUser();
        return ResponseEntity.ok(ApiResponse.ok("ADMIN".equals(u.getRole())));
    }
}
