package com.finflow.analyzer.controller;

import com.finflow.analyzer.service.AnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/analytics")
@RequiredArgsConstructor
public class AnalyticsController {
    private final AnalyticsService analytics;

    @GetMapping("/summary") public Object summary(@RequestParam(required=false) String account){ return analytics.summary(account); }
    @GetMapping("/categories") public Object categories(@RequestParam(required=false) String account){ return analytics.categories(account); }
    @GetMapping("/monthly") public Object monthly(@RequestParam(required=false) String account){ return analytics.monthly(account); }
    @GetMapping("/yearly") public Object yearly(@RequestParam(required=false) String account){ return analytics.yearly(account); }
    @GetMapping("/merchants") public Object merchants(@RequestParam(required=false) String account){ return analytics.merchants(account); }
    @GetMapping("/merchants/all") public Object allMerchants(@RequestParam(required=false) String account){ return analytics.allMerchants(account); }
    @GetMapping("/upi") public Object upi(@RequestParam(required=false) String account){ return analytics.upi(account); }
    @GetMapping("/upi/all") public Object allUpi(@RequestParam(required=false) String account){ return analytics.allUpi(account); }
    @GetMapping("/financial") public Object financial(@RequestParam(required=false) String account){ return analytics.financial(account); }
    @GetMapping("/card-payments") public Object cardPayments(@RequestParam(required=false) String account){ return analytics.cardPayments(account); }
    @GetMapping("/outflows") public Object outflows(@RequestParam(required=false) String account){ return analytics.outflows(account); }
    @GetMapping("/income") public Object income(@RequestParam(required=false) String account){ return analytics.income(account); }
    @GetMapping("/income-monthly") public Object incomeMonthly(@RequestParam(required=false) String account){ return analytics.incomeMonthly(account); }
    @GetMapping("/income-yearly") public Object incomeYearly(@RequestParam(required=false) String account){ return analytics.incomeYearly(account); }
    @GetMapping("/loans") public Object loans(@RequestParam(required=false) String account){ return analytics.loans(account); }
    @GetMapping("/ledger") public Object ledger(@RequestParam(required=false) String account, @RequestParam(defaultValue="upi") String kind){ return analytics.ledger(account, kind); }
    @GetMapping("/financial/all") public Object allFinancial(@RequestParam(required=false) String account){ return analytics.allFinancial(account); }
    @GetMapping("/insights") public Object insights(@RequestParam(required=false) String account){ return analytics.insights(account); }
    @GetMapping("/account-summary") public Object accountSummary(){ return analytics.accountSummary(); }
}
