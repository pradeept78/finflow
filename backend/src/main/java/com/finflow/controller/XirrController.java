package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.Investment;
import com.finflow.entity.User;
import com.finflow.repository.InvestmentRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/investments")
@RequiredArgsConstructor
public class XirrController {

    private final InvestmentRepository repo;
    private final UserRepository userRepository;

    // Was missing entirely: repo.findById(id).orElseThrow() with no ownership check meant any
    // authenticated user could read another user's investment (SIP amount, start date, current
    // value) by guessing/incrementing an id. findByIdAndUserId already existed on
    // InvestmentRepository (used correctly everywhere else) — this endpoint just wasn't using it.
    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    @GetMapping("/{id}/xirr")
    public ResponseEntity<ApiResponse<Double>> calculateXirr(@PathVariable Long id) {
        Investment inv = repo.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Investment not found"));
        if (inv.getMonthly() == null || inv.getStartDate() == null || inv.getCurrentValue() == null) {
            return ResponseEntity.ok(ApiResponse.ok("No data", 0.0));
        }

        LocalDate start = inv.getStartDate();
        LocalDate now = LocalDate.now();
        long months = ChronoUnit.MONTHS.between(start, now);

        // Build cash flows: negative monthly payments, positive final value
        List<double[]> cashFlows = new ArrayList<>(); // [days, amount]
        for (int i = 0; i < months; i++) {
            LocalDate date = start.plusMonths(i);
            long days = ChronoUnit.DAYS.between(start, date);
            cashFlows.add(new double[]{days, -inv.getMonthly().doubleValue()});
        }
        // Final value (today)
        long totalDays = ChronoUnit.DAYS.between(start, now);
        cashFlows.add(new double[]{totalDays, inv.getCurrentValue().doubleValue()});

        double xirr = computeXirr(cashFlows);
        return ResponseEntity.ok(ApiResponse.ok("XIRR", Math.round(xirr * 1000.0) / 10.0));
    }

    // Newton-Raphson XIRR
    private double computeXirr(List<double[]> cashFlows) {
        double rate = 0.1; // initial guess 10%
        for (int iter = 0; iter < 100; iter++) {
            double f = 0, df = 0;
            for (double[] cf : cashFlows) {
                double t = cf[0] / 365.0;
                double pv = cf[1] / Math.pow(1 + rate, t);
                f += pv;
                df += -t * cf[1] / Math.pow(1 + rate, t + 1);
            }
            if (Math.abs(df) < 1e-10) break;
            double newRate = rate - f / df;
            if (Math.abs(newRate - rate) < 1e-6) return newRate;
            rate = newRate;
            if (rate < -0.999) rate = -0.999;
        }
        return rate;
    }
}
