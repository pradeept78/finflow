package com.finflow.analyzer.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class CategoryService {
    private final Map<String, List<String>> rules = new LinkedHashMap<>();

    public CategoryService() {
        rules.put("Food & Restaurants", List.of("swiggy","zomato","restaurant","cafe","coffee","dominos","pizza","food","blinkit","zepto"));
        rules.put("Groceries", List.of("bigbasket","dmart","more supermarket","reliance smart","grocery","instamart"));
        rules.put("Shopping", List.of("amazon","flipkart","myntra","ajio","meesho","shopping","retail"));
        rules.put("Fuel", List.of("shell","hpcl","bharat petroleum","bpcl","indian oil","iocl","petrol","fuel","nayara"));
        rules.put("Travel", List.of("uber","ola","rapido","irctc","makemytrip","goibibo","cleartrip","air india","indigo","booking.com"));
        rules.put("Bills & Utilities", List.of("electricity","bescom","water bill","gas bill","airtel","jio","vi ","vodafone","broadband","internet","utility"));
        rules.put("Subscriptions", List.of("netflix","spotify","prime video","youtube","hotstar","adobe","google one","apple.com/bill"));
        rules.put("Medical", List.of("pharmacy","hospital","apollo","medplus","medicine","medical","diagnostic","clinic"));
        rules.put("Insurance", List.of("insurance","lic ","icici lombard","hdfc ergo","star health"));
        rules.put("Entertainment", List.of("bookmyshow","pvr","inox","gaming","playstation","steam"));
        rules.put("Education", List.of("udemy","coursera","education","school","college"));
        rules.put("EMI / Loan", List.of("emi","loan","nach","mandate","installment"));
        rules.put("Bank Charges", List.of("annual fee","late fee","finance charge","gst on","bank charge","atm fee"));
    }

    public Classification classify(String description, String direction, String account) {
        String d = description == null ? "" : description.toLowerCase(Locale.ROOT);
        String a = account == null ? "" : account.toLowerCase(Locale.ROOT);

        if (isInternalTransfer(d)) {
            return new Classification("Transfers", "Internal Transfer", "TRANSFER", true);
        }
        if (isCardPayment(d)) {
            return new Classification("Credit Card Payment", "Card Bill Payment", "TRANSFER", true);
        }
        if ("CREDIT".equalsIgnoreCase(direction)) {
            if (containsAny(d, "refund","reversal","cashback","chargeback")) {
                return new Classification("Refunds & Cashback", "Refund/Cashback", "REFUND", true);
            }
            // Money BORROWED (loan disbursement) is not income — tag it LOAN so it doesn't
            // inflate real income. Repayments (debits) stay EMI via the rules below.
            if (isLoanDisbursement(d)) {
                return new Classification("Loan / Disbursement", "Loan taken", "LOAN", true);
            }
            // Money coming back from an investment (redemption) is not fresh income.
            if (isSavings(d)) {
                return new Classification("Savings / Investment", "Investment redemption", "SAVINGS", true);
            }
            return new Classification("Income / Credits", "Other Credit", "INCOME", true);
        }

        // Money moved into savings / investments is parked, not spent — exclude from spending.
        if (isSavings(d)) {
            return new Classification("Savings / Investment", "Investment", "SAVINGS", true);
        }

        for (var entry : rules.entrySet()) {
            if (containsAny(d, entry.getValue().toArray(String[]::new))) {
                String type = entry.getKey().equals("EMI / Loan") ? "EMI" :
                        entry.getKey().equals("Bank Charges") ? "FEE" : "SPENDING";
                return new Classification(entry.getKey(), "General", type, false);
            }
        }
        return new Classification("Other", "Uncategorized", "OTHER", false);
    }

    // Savings / investment moves (SIP, mutual funds, deposits, brokerages) — parked, not spent.
    private boolean isSavings(String d) {
        return containsAny(d, "mutual fund", "mutualfund", "systematic invest", " sip ", "sip/",
                "sip-", "-sip", "sipmf", "groww", "zerodha", "smallcase", "kuvera", "indmoney",
                "etmoney", "et money", "paytm money", "paytmmoney", "upstox", "recurring deposit",
                "fixed deposit", "term deposit", "ppf", "sukanya", "national pension", " nps ",
                "elss", "nippon india", "sbi mutual", "hdfc mutual", "icici pru", "axis mutual",
                "mirae", "quant mutual", "parag parikh", "invest");
    }

    // A credit that is borrowed money (loan disbursement), not income.
    private boolean isLoanDisbursement(String d) {
        return containsAny(d, "disburs", "loan cr", "loan disb", "fincorp",
                "l and t finance", "l&t finance", "bajaj finance", "idfc first", "hero fincorp",
                "kreditbee", "krazybee", "varthana", "tata capital", "aditya birla finance",
                "muthoot", "manappuram", "fullerton", "poonawalla", "cholamandalam", "shriram",
                "incred", "moneyview", "kissht", "cashe", "home credit");
    }

    private boolean isCardPayment(String d) {
        // Money leaving a bank account to pay a credit-card bill is not spending.
        if (containsAny(d, "credit card payment", "card payment", "cc payment", "cc bill",
                "card bill", "cardbill", "creditcard", "payment received", "billpay to card",
                "bill paid to credit card", "paid to credit card", "paid card number", "ccbill",
                "credclub", "dreamplug",   // CRED (CredClub / Dreamplug Technologies)
                "onecard", "one card", "bobcard", "uni cards", "unicard", "zipcash")) {  // card brands
            return true;
        }
        // CRED app pays card bills. Match "cred" only as a whole token so
        // "credit"/"credited"/"credential" do NOT trigger a false positive.
        return d.contains("cred club") || d.contains("cred.club") || d.matches(".*\\bcred\\b.*");
    }

    private boolean isInternalTransfer(String d) {
        return containsAny(d, "self transfer", "self txn", "own account", "own acct", "own a/c",
                "fund transfer", "funds transfer", "upi transfer to", "transfer to self",
                "to self", "self/", "/self", "a/c transfer", "acct transfer");
    }

    private boolean containsAny(String value, String... terms) {
        for (String term : terms) if (value.contains(term)) return true;
        return false;
    }

    public record Classification(String category, String subCategory, String transactionType, boolean excludedFromSpend) {}
}
