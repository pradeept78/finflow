package com.finflow.messages;

import com.finflow.entity.CreditCard;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Which bill a card payment settles: same rule as the app's card cycle (utils/cardCycle.ts). */
class BillDueMonthTest {

    private static CreditCard card(Integer statementDay, Integer dueDay) {
        CreditCard c = new CreditCard();
        c.setBillingDay(statementDay);
        c.setDueDay(dueDay);
        return c;
    }

    @Test void dueLaterInTheStatementMonth() {
        // HDFC: statement 3rd, due 20th. Paid 10 Nov → the bill stated 3 Nov, due 20 Nov.
        assertEquals(YearMonth.of(2026, 11), BankMessageService.billDueMonth(card(3, 20), LocalDate.of(2026, 11, 10)));
    }

    @Test void dueInTheMonthAfterTheStatement() {
        // Statement 25th, due 12th. Paid 2 Dec → stated 25 Nov, due 12 Dec.
        assertEquals(YearMonth.of(2026, 12), BankMessageService.billDueMonth(card(25, 12), LocalDate.of(2026, 12, 2)));
        // Paid 28 Nov (after the 25 Nov statement) → same bill, due 12 Dec.
        assertEquals(YearMonth.of(2026, 12), BankMessageService.billDueMonth(card(25, 12), LocalDate.of(2026, 11, 28)));
    }

    @Test void paidBeforeThisMonthsStatementSettlesLastBill() {
        // Statement 18th, due 4th. Paid 1 Nov → stated 18 Oct, due 4 Nov.
        assertEquals(YearMonth.of(2026, 11), BankMessageService.billDueMonth(card(18, 4), LocalDate.of(2026, 11, 1)));
    }

    @Test void noCycleDaysUsesThePaymentMonth() {
        assertEquals(YearMonth.of(2026, 11), BankMessageService.billDueMonth(card(null, 20), LocalDate.of(2026, 11, 10)));
    }

    @Test void statementDateFromItsDueDate() {
        assertEquals(LocalDate.of(2026, 11, 3), BankMessageService.statementFor(card(3, 20), LocalDate.of(2026, 11, 20), null));
        assertEquals(LocalDate.of(2026, 11, 25), BankMessageService.statementFor(card(25, 12), LocalDate.of(2026, 12, 12), null));
        assertEquals(LocalDate.of(2026, 11, 1), BankMessageService.statementFor(card(3, 20), null, LocalDate.of(2026, 11, 1)), "no due date: the day it arrived");
    }
}
