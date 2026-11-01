package com.finflow.messages;

import com.finflow.entity.*;
import com.finflow.messages.BankMessageParser.Kind;
import com.finflow.messages.BankMessageParser.Parsed;
import com.finflow.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Bank messages in, suggestions out, money only on confirm.
 *
 * ingest: read the message (BankMessageParser), match it to one of the user's cards or loans by the
 *   last 4 digits, store it as NEW. The same text twice (a Shortcut retry) is stored once.
 * confirm: do what the message says, through the same records the app's own forms write —
 *   card spend → a CardSpend on that card; statement → the card's outstanding for that statement;
 *   card payment → that bill ticked paid; EMI debit → that loan ticked paid for the month;
 *   converted to EMI → a CardEmi on the card.
 * Nothing is ever applied without a confirm, so a misread message can't change a total.
 */
@Service
@RequiredArgsConstructor
public class BankMessageService {

    /** Per user per day: a runaway Shortcut can't flood the table. */
    static final int DAILY_LIMIT = 300;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final BankMessageRepository repo;
    private final CreditCardRepository cardRepo;
    private final LoanRepository loanRepo;
    private final CardSpendRepository spendRepo;
    private final CardEmiRepository emiRepo;
    private final MonthlyPaidMarkRepository paidRepo;
    private final UserRepository userRepo;

    // ── ingest ──

    @Transactional
    public BankMessage ingest(User user, String source, String sender, String text, LocalDateTime receivedAt) {
        String body = text == null ? "" : text.trim();
        if (body.isEmpty()) throw new RuntimeException("The message is empty");
        if (body.length() > 1000) throw new RuntimeException("That's longer than a bank message (1,000 characters max)");
        String from = sender == null ? null : sender.trim();
        if (from != null && from.length() > 40) from = from.substring(0, 40);
        String hash = sha256((from == null ? "" : from.toLowerCase(Locale.ROOT)) + "\n" + body.replaceAll("\\s+", " "));
        var dup = repo.findByUserIdAndBodyHash(user.getId(), hash);
        if (dup.isPresent()) return dup.get();
        if (repo.countByUserIdAndCreatedAtAfter(user.getId(), LocalDateTime.now().minusDays(1)) >= DAILY_LIMIT)
            throw new RuntimeException("Too many messages today");

        Parsed p = BankMessageParser.parse(body);
        BankMessage m = BankMessage.builder()
                .user(user).source(source).sender(from).body(body).bodyHash(hash)
                .receivedAt(receivedAt != null ? receivedAt : LocalDateTime.now())
                .kind(p.kind()).amount(p.amount()).last4(p.last4()).merchant(p.merchant())
                .txnDate(p.date()).dueDate(p.dueDate()).minDue(p.minDue()).tenure(p.tenure()).emiAmount(p.emiAmount())
                .note(p.note())
                // Unreadable ones go straight to Handled: nothing to confirm, and they'd only clutter the review list.
                .status(p.kind() == Kind.IGNORED || p.kind() == Kind.UNKNOWN ? BankMessage.Status.IGNORED : BankMessage.Status.NEW)
                .createdAt(LocalDateTime.now())
                .build();
        match(user, m);
        m = repo.save(m);
        // Auto-add (on unless turned off): a sure match is applied straight away; Undo reverses it.
        // Anything that can't be applied cleanly just stays in To review.
        if (m.isSure() && m.getStatus() == BankMessage.Status.NEW && !Boolean.FALSE.equals(user.getAutoAddMessages())) {
            try {
                apply(user, m);
                m.setAutoAdded(true);
                m = repo.save(m);
            } catch (RuntimeException e) {
                m.setStatus(BankMessage.Status.NEW);
            }
        }
        return m;
    }

    /** Card kinds match a card by last 4 digits; EMI debits a loan by last 4, else by an exact, unique EMI amount. */
    void match(User user, BankMessage m) {
        Kind k = m.getKind();
        if (k == Kind.IGNORED || k == Kind.UNKNOWN) return;
        if (k == Kind.EMI_DEBIT) {
            List<Loan> loans = loanRepo.findByUserId(user.getId());
            List<Loan> byDigits = m.getLast4() == null ? List.of() : loans.stream().filter(l -> m.getLast4().equals(l.getLast4())).toList();
            if (byDigits.size() == 1) { target(m, "LOAN", byDigits.get(0).getId(), m.getAmount() != null); return; }
            if (m.getAmount() != null) {
                List<Loan> byAmount = loans.stream().filter(l -> l.getEmi() != null && l.getEmi().compareTo(m.getAmount()) == 0).toList();
                if (byAmount.size() == 1) target(m, "LOAN", byAmount.get(0).getId(), false);   // likely, not sure
            }
            return;
        }
        if (m.getLast4() == null) return;
        List<CreditCard> cards = cardRepo.findByUserId(user.getId()).stream().filter(c -> m.getLast4().equals(c.getLast4())).toList();
        boolean amountOk = k == Kind.CARD_EMI ? m.getAmount() != null && m.getTenure() != null && m.getEmiAmount() != null : m.getAmount() != null;
        if (cards.size() == 1) target(m, "CARD", cards.get(0).getId(), amountOk);
    }

    private static void target(BankMessage m, String type, Long id, boolean sure) {
        m.setTargetType(type); m.setTargetId(id); m.setSure(sure);
    }

    // ── review ──

    /** Waiting messages with no card/loan yet are matched again, so digits added later (or learned) apply to them. */
    @Transactional
    public List<BankMessage> list(User user) {
        List<BankMessage> all = repo.findByUserIdOrderByReceivedAtDesc(user.getId());
        for (BankMessage m : all) {
            if (m.getStatus() == BankMessage.Status.NEW && m.getTargetId() == null) {
                match(user, m);
                if (m.getTargetId() != null) repo.save(m);
            }
        }
        return all;
    }

    public long countAutoAddedSince(User user, LocalDateTime since) {
        return repo.countByUserIdAndAutoAddedTrueAndCreatedAtAfter(user.getId(), since);
    }

    @Transactional
    public void setAutoAdd(User user, boolean on) {
        user.setAutoAddMessages(on);
        userRepo.save(user);
    }

    public long countNew(User user) { return repo.countByUserIdAndStatus(user.getId(), BankMessage.Status.NEW); }

    @Transactional
    public BankMessage ignore(User user, Long id) {
        BankMessage m = own(user, id);
        if (m.getStatus() == BankMessage.Status.CONFIRMED) throw new RuntimeException("Already added — undo it where it was added");
        m.setStatus(BankMessage.Status.IGNORED);
        return repo.save(m);
    }

    /** Applies the message; `edits` may correct targetId, amount, merchant, date, emiAmount, tenure first. */
    @Transactional
    public BankMessage confirm(User user, Long id, Map<String, Object> edits) {
        BankMessage m = own(user, id);
        if (m.getStatus() != BankMessage.Status.NEW) throw new RuntimeException("This message was already handled");
        applyEdits(m, edits == null ? Map.of() : edits);
        apply(user, m);
        return repo.save(m);
    }

    /**
     * Does what the message says and records it in `resultRef` so Undo can reverse exactly that.
     * Also learns the card's / loan's last 4 digits from the message when it has none yet, so the
     * next message from it matches on its own.
     */
    private void apply(User user, BankMessage m) {
        BigDecimal amt = m.getAmount();
        if (amt == null || amt.signum() <= 0) throw new RuntimeException("Add the amount first");
        LocalDate day = m.getTxnDate() != null ? m.getTxnDate() : m.getReceivedAt().toLocalDate();
        String note, ref;
        switch (m.getKind()) {
            case CARD_SPEND -> {
                CreditCard card = card(user, m);
                learnDigits(user, card, m);
                CardSpend sp = spendRepo.save(CardSpend.builder().card(card).purpose(m.getMerchant() != null ? m.getMerchant() : "Card spend")
                        .amount(amt).spendDate(day).owedSettled(false).createdAt(LocalDateTime.now()).build());
                note = "Added " + rupees(amt) + " spend to " + card.getBanker();
                ref = "spend:" + sp.getId();
            }
            case CARD_STATEMENT -> {
                CreditCard card = card(user, m);
                learnDigits(user, card, m);
                ref = "bill:" + card.getId() + ":" + plain(card.getOutstanding()) + ":" + (card.getOutstandingAsOf() == null ? "" : card.getOutstandingAsOf()) + ":" + plain(amt);
                card.setOutstanding(amt);
                // Which statement this bill is: worked out from its due date when the message has one, so a
                // statement SMS pasted days later still lands on the right bill; else the day it arrived.
                card.setOutstandingAsOf(statementFor(card, m.getDueDate(), m.getReceivedAt().toLocalDate()));
                cardRepo.save(card);
                note = card.getBanker() + " bill set to " + rupees(amt) + (m.getDueDate() != null ? ", due " + m.getDueDate() : "");
            }
            case CARD_PAYMENT -> {
                CreditCard card = card(user, m);
                learnDigits(user, card, m);
                String month = billDueMonth(card, day).toString();
                ref = "paid:" + String.join(",", markPaid(user, "card-out-" + card.getId(), month), markPaid(user, "spend-" + card.getId(), month)).replaceAll("^,|,$", "");
                note = card.getBanker() + " bill due " + month + " ticked paid";
            }
            case CARD_EMI -> {
                CreditCard card = card(user, m);
                if (m.getEmiAmount() == null || m.getTenure() == null) throw new RuntimeException("Add the monthly EMI and the number of months first");
                learnDigits(user, card, m);
                CardEmi emi = emiRepo.save(CardEmi.builder().card(card).label(m.getMerchant() != null ? m.getMerchant() : "EMI conversion")
                        .principal(amt).emi(m.getEmiAmount()).tenure(m.getTenure()).startDate(day)
                        .missedMonths(0).owedSettled(false).createdAt(LocalDateTime.now()).build());
                note = "Added card EMI " + rupees(m.getEmiAmount()) + " × " + m.getTenure() + " to " + card.getBanker();
                ref = "emi:" + emi.getId();
            }
            case EMI_DEBIT -> {
                if (!"LOAN".equals(m.getTargetType()) || m.getTargetId() == null) throw new RuntimeException("Pick which loan this EMI is for");
                Loan loan = loanRepo.findByIdAndUserId(m.getTargetId(), user.getId()).orElseThrow(() -> new RuntimeException("Loan not found"));
                if (m.getLast4() != null && loan.getLast4() == null
                        && loanRepo.findByUserId(user.getId()).stream().noneMatch(l -> m.getLast4().equals(l.getLast4()))) {
                    loan.setLast4(m.getLast4());
                    loanRepo.save(loan);
                }
                String month = YearMonth.from(day).toString();
                ref = "paid:" + markPaid(user, "loan-" + loan.getId(), month);
                note = loan.getLender() + " EMI for " + month + " ticked paid";
            }
            default -> throw new RuntimeException("FinFlow can't add this kind of message");
        }
        m.setStatus(BankMessage.Status.CONFIRMED);
        m.setResultNote(note);
        m.setResultRef(ref);
    }

    /** First time a card is picked for a message with digits it doesn't have yet: remember them (unless another card has them). */
    private void learnDigits(User user, CreditCard card, BankMessage m) {
        if (m.getLast4() == null || card.getLast4() != null) return;
        if (cardRepo.findByUserId(user.getId()).stream().anyMatch(c -> m.getLast4().equals(c.getLast4()))) return;
        card.setLast4(m.getLast4());
        cardRepo.save(card);
    }

    /** Reverses exactly what confirming did, and puts the message back in To review. */
    @Transactional
    public BankMessage undo(User user, Long id) {
        BankMessage m = own(user, id);
        if (m.getStatus() != BankMessage.Status.CONFIRMED) throw new RuntimeException("Only added messages can be undone");
        String ref = m.getResultRef() == null ? "" : m.getResultRef();
        if (ref.startsWith("spend:")) {
            // Out of the card's (eager, orphan-removing) list too, or the flush would keep it alive.
            spendRepo.findByIdAndCard_User_Id(Long.valueOf(ref.substring(6)), user.getId()).ifPresent(sp -> {
                sp.getCard().getSpends().removeIf(x -> x.getId().equals(sp.getId()));
                spendRepo.delete(sp);
            });
        } else if (ref.startsWith("emi:")) {
            emiRepo.findByIdAndCard_User_Id(Long.valueOf(ref.substring(4)), user.getId()).ifPresent(e -> {
                e.getCard().getEmis().removeIf(x -> x.getId().equals(e.getId()));
                emiRepo.delete(e);
            });
        } else if (ref.startsWith("paid:")) {
            for (String km : ref.substring(5).split(",")) {
                int at = km.lastIndexOf('@');
                if (at > 0) paidRepo.deleteByUserIdAndItemKeyAndMonthYear(user.getId(), km.substring(0, at), km.substring(at + 1));
            }
        } else if (ref.startsWith("bill:")) {
            String[] f = ref.split(":", -1);   // bill:cardId:prevAmount:prevAsOf:newAmount
            cardRepo.findByIdAndUserId(Long.valueOf(f[1]), user.getId()).ifPresent(card -> {
                // Only if the bill is still what this message set: a later edit by hand wins.
                if (card.getOutstanding() != null && card.getOutstanding().compareTo(new BigDecimal(f[4])) == 0) {
                    card.setOutstanding(f[2].isEmpty() ? BigDecimal.ZERO : new BigDecimal(f[2]));
                    card.setOutstandingAsOf(f[3].isEmpty() ? null : LocalDate.parse(f[3]));
                    cardRepo.save(card);
                }
            });
        }
        m.setStatus(BankMessage.Status.NEW);
        m.setAutoAdded(false);
        m.setResultRef(null);
        m.setResultNote(null);
        return repo.save(m);
    }

    private static String plain(BigDecimal v) { return v == null ? "" : v.toPlainString(); }

    private void applyEdits(BankMessage m, Map<String, Object> e) {
        if (e.get("targetId") != null) {
            m.setTargetId(Long.valueOf(String.valueOf(e.get("targetId"))));
            m.setTargetType(m.getKind() == Kind.EMI_DEBIT ? "LOAN" : "CARD");
        }
        if (e.get("amount") != null) m.setAmount(new BigDecimal(String.valueOf(e.get("amount"))));
        if (e.get("merchant") != null) { String s = String.valueOf(e.get("merchant")).trim(); m.setMerchant(s.isEmpty() ? null : s.length() > 60 ? s.substring(0, 60) : s); }
        if (e.get("date") != null) m.setTxnDate(LocalDate.parse(String.valueOf(e.get("date"))));
        if (e.get("emiAmount") != null) m.setEmiAmount(new BigDecimal(String.valueOf(e.get("emiAmount"))));
        if (e.get("tenure") != null) m.setTenure(Integer.valueOf(String.valueOf(e.get("tenure"))));
    }

    private CreditCard card(User user, BankMessage m) {
        if (!"CARD".equals(m.getTargetType()) || m.getTargetId() == null) throw new RuntimeException("Pick which card this is");
        return cardRepo.findByIdAndUserId(m.getTargetId(), user.getId()).orElseThrow(() -> new RuntimeException("Card not found"));
    }

    private BankMessage own(User user, Long id) {
        return repo.findByIdAndUserId(id, user.getId()).orElseThrow(() -> new RuntimeException("Message not found"));
    }

    /** Ticks key for month; returns "key@month" when this created the tick (so Undo removes only its own), else "". */
    private String markPaid(User user, String key, String month) {
        if (paidRepo.existsByUserIdAndItemKeyAndMonthYear(user.getId(), key, month)) return "";
        paidRepo.save(MonthlyPaidMark.builder().user(user).itemKey(key).monthYear(month).createdAt(LocalDateTime.now()).build());
        return key + "@" + month;
    }

    /**
     * The month whose bill a payment on `paid` settles, the way the app's card cycle sees it
     * (utils/cardCycle.ts): the latest statement on or before the payment, due on the first due day
     * after that statement. Without statement/due days, the payment's own month.
     */
    static YearMonth billDueMonth(CreditCard card, LocalDate paid) {
        Integer s = card.getBillingDay(), d = card.getDueDay();
        if (s == null || d == null) return YearMonth.from(paid);
        YearMonth stmtMonth = YearMonth.from(paid);
        if (paid.getDayOfMonth() < Math.min(s, stmtMonth.lengthOfMonth())) stmtMonth = stmtMonth.minusMonths(1);
        return d > s ? stmtMonth : stmtMonth.plusMonths(1);
    }

    /**
     * The statement date a bill due on `due` comes from: the last statement day strictly before the due
     * date (statement 3rd → due 20th the same month; statement 25th → due 12th the next month).
     */
    static LocalDate statementFor(CreditCard card, LocalDate due, LocalDate fallback) {
        Integer s = card.getBillingDay();
        if (due == null || s == null) return fallback;
        YearMonth ym = YearMonth.from(due);
        LocalDate stmt = ym.atDay(Math.min(s, ym.lengthOfMonth()));
        if (!stmt.isBefore(due)) { ym = ym.minusMonths(1); stmt = ym.atDay(Math.min(s, ym.lengthOfMonth())); }
        return stmt;
    }

    // ── the Shortcut's key ──

    /** A new personal key (shown once); replaces any earlier one. */
    @Transactional
    public String newIngestKey(User user) {
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        String key = "ffk_" + Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        user.setIngestKeyHash(sha256(key));
        userRepo.save(user);
        return key;
    }

    @Transactional
    public void revokeIngestKey(User user) {
        user.setIngestKeyHash(null);
        userRepo.save(user);
    }

    public boolean hasIngestKey(User user) { return user.getIngestKeyHash() != null; }

    public User userForKey(String key) {
        if (key == null || !key.startsWith("ffk_") || key.length() > 80) return null;
        return userRepo.findByIngestKeyHash(sha256(key.trim())).orElse(null);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String rupees(BigDecimal v) {
        return "₹" + String.format(new Locale("en", "IN"), "%,.0f", v);
    }
}
