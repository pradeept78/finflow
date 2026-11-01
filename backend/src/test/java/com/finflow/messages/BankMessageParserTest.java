package com.finflow.messages;

import com.finflow.messages.BankMessageParser.Kind;
import com.finflow.messages.BankMessageParser.Parsed;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Typical Indian bank alert wordings (card numbers, amounts and merchants made up). Each case says
 * what FinFlow should take from it; anything risky must come out IGNORED, never as money.
 */
class BankMessageParserTest {

    private static Parsed p(String s) { return BankMessageParser.parse(s); }
    private static BigDecimal rs(String s) { return new BigDecimal(s); }

    // ── card spends ──

    @Test void hdfcSpend() {
        Parsed r = p("Rs.1250.00 spent on HDFC Bank Card x4521 at SWIGGY on 2026-10-30:20:15:11.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 4521 to 7308080808");
        assertEquals(Kind.CARD_SPEND, r.kind());
        assertEquals(0, rs("1250").compareTo(r.amount()));
        assertEquals("4521", r.last4());
        assertEquals("SWIGGY", r.merchant());
        assertEquals(LocalDate.of(2026, 10, 30), r.date());
    }

    @Test void iciciSpendWithMerchantAfterDate() {
        Parsed r = p("INR 3,499.00 spent using ICICI Bank Card XX9876 on 29-Oct-26 on AMAZON PAY IN. Avl Limit: INR 1,21,500.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766.");
        assertEquals(Kind.CARD_SPEND, r.kind());
        assertEquals(0, rs("3499").compareTo(r.amount()));
        assertEquals("9876", r.last4());
        assertEquals("AMAZON PAY IN", r.merchant());
        assertEquals(LocalDate.of(2026, 10, 29), r.date());
    }

    @Test void sbiCardEnding() {
        Parsed r = p("Rs.799.00 spent on your SBI Credit Card ending 3344 at NETFLIX on 28/10/26. Trxn. Not done by you? Report at https://sbicard.com/Dispute");
        assertEquals(Kind.CARD_SPEND, r.kind());
        assertEquals("3344", r.last4());
        assertEquals("NETFLIX", r.merchant());
        assertEquals(LocalDate.of(2026, 10, 28), r.date());
    }

    @Test void axisMultiLine() {
        Parsed r = p("Spent INR 2,150.50\nAxis Bank Card no. XX1122\n30-10-26 19:42:10 IST\nZOMATO LTD\nAvl Limit: INR 98,765.40\nNot you? SMS BLOCK 1122 to 919951860002");
        assertEquals(Kind.CARD_SPEND, r.kind());
        assertEquals(0, rs("2150.50").compareTo(r.amount()));
        assertEquals("1122", r.last4());
        assertEquals("ZOMATO LTD", r.merchant());
        assertEquals(LocalDate.of(2026, 10, 30), r.date());
    }

    @Test void kotakSpend() {
        Parsed r = p("Rs.540.00 spent via Kotak Credit Card XX5566 at UBER INDIA on 31/10/2026. Avl limit Rs.45,000.00. Not you? Call 18602662666");
        assertEquals(Kind.CARD_SPEND, r.kind());
        assertEquals("5566", r.last4());
        assertEquals("UBER INDIA", r.merchant());
        assertEquals(LocalDate.of(2026, 10, 31), r.date());
    }

    // ── statements, payments, EMIs ──

    @Test void hdfcStatement() {
        Parsed r = p("Your HDFC Bank Credit Card XX4521 statement is generated. Total Amt Due: Rs.84,200.00, Min Amt Due: Rs.4,210.00, Payment Due Date: 12-11-2026.");
        assertEquals(Kind.CARD_STATEMENT, r.kind());
        assertEquals(0, rs("84200").compareTo(r.amount()));
        assertEquals(0, rs("4210").compareTo(r.minDue()));
        assertEquals("4521", r.last4());
        assertEquals(LocalDate.of(2026, 11, 12), r.dueDate());
    }

    @Test void iciciStatement() {
        Parsed r = p("ICICI Bank Credit Card XX9876 Statement: Total amount due INR 62,000.00; Minimum amount due INR 3,100.00; due by 18-Nov-26.");
        assertEquals(Kind.CARD_STATEMENT, r.kind());
        assertEquals(0, rs("62000").compareTo(r.amount()));
        assertEquals(LocalDate.of(2026, 11, 18), r.dueDate());
    }

    @Test void cardPaymentReceived() {
        Parsed r = p("Payment of Rs.84,200.00 received towards your HDFC Bank Credit Card XX4521 on 10-11-2026. Thank you.");
        assertEquals(Kind.CARD_PAYMENT, r.kind());
        assertEquals(0, rs("84200").compareTo(r.amount()));
        assertEquals("4521", r.last4());
        assertEquals(LocalDate.of(2026, 11, 10), r.date());
    }

    @Test void sbiPaymentReceived() {
        Parsed r = p("We have received payment of Rs. 12,000.00 towards your SBI Credit Card ending 3344 on 05/11/26.");
        assertEquals(Kind.CARD_PAYMENT, r.kind());
        assertEquals("3344", r.last4());
        assertEquals(LocalDate.of(2026, 11, 5), r.date());
    }

    @Test void loanEmiDebitedFromAccount() {
        Parsed r = p("Your A/c XX7890 is debited for Rs.48,500.00 on 05-11-26 towards EMI for Loan A/c XX1234. Avl Bal Rs 1,23,456.78 -HDFC Bank");
        assertEquals(Kind.EMI_DEBIT, r.kind());
        assertEquals(0, rs("48500").compareTo(r.amount()));
        assertEquals("1234", r.last4(), "the loan's digits, not the bank account's");
        assertEquals(LocalDate.of(2026, 11, 5), r.date());
    }

    @Test void sbiLoanEmi() {
        Parsed r = p("EMI of Rs 17,800 for your loan account ending 5678 has been debited on 10-Nov-2026. -SBI");
        assertEquals(Kind.EMI_DEBIT, r.kind());
        assertEquals(0, rs("17800").compareTo(r.amount()));
        assertEquals("5678", r.last4());
        assertEquals(LocalDate.of(2026, 11, 10), r.date());
    }

    @Test void bajajEmiPresented() {
        Parsed r = p("Dear Customer, EMI of Rs.10500 for Loan A/c no. XXXXXXXX9012 has been successfully presented on 03-Nov-26. Bajaj Finance");
        assertEquals(Kind.EMI_DEBIT, r.kind());
        assertEquals(0, rs("10500").compareTo(r.amount()));
        assertEquals("9012", r.last4());
    }

    @Test void convertedToEmi() {
        Parsed r = p("Your transaction of Rs.60,000.00 at CROMA on HDFC Bank Credit Card XX4521 has been converted to EMI for 12 months. EMI Rs.5,281.00. Ref 1234");
        assertEquals(Kind.CARD_EMI, r.kind());
        assertEquals(0, rs("60000").compareTo(r.amount()));
        assertEquals("4521", r.last4());
        assertEquals("CROMA", r.merchant());
        assertEquals(12, r.tenure());
        assertEquals(0, rs("5281").compareTo(r.emiAmount()));
    }

    // ── never money ──

    @Test void otpIsIgnored() {
        assertEquals(Kind.IGNORED, p("123456 is the OTP for transaction of INR 1,250.00 at SWIGGY on your HDFC Bank Card XX4521. Valid for 10 mins. Do not share.").kind());
    }

    @Test void declinedIsIgnored() {
        assertEquals(Kind.IGNORED, p("Transaction of Rs 5,000 on HDFC Bank Card XX4521 declined due to insufficient limit.").kind());
    }

    @Test void refundIsIgnored() {
        assertEquals(Kind.IGNORED, p("Rs.499.00 credited (refund) to your ICICI Bank Card XX9876 from AMAZON on 29-Oct-26.").kind());
    }

    @Test void upiFromBankAccountIsIgnored() {
        assertEquals(Kind.IGNORED, p("Rs.250.00 debited from A/c XX7890 on 31-10-26 to VPA swiggy@icici (UPI Ref No 1234). Not you? Call 18002586161").kind());
    }

    @Test void debitCardIsIgnored() {
        assertEquals(Kind.IGNORED, p("Rs 600.00 spent on your Debit Card XX1111 at DMART on 30-10-26.").kind());
    }

    @Test void chatterIsUnknown() {
        Parsed r = p("Hi! Your order has shipped and will arrive tomorrow.");
        assertEquals(Kind.UNKNOWN, r.kind());
        assertNull(r.amount());
    }

    @Test void blankIsUnknown() {
        assertEquals(Kind.UNKNOWN, p("  ").kind());
    }
}
