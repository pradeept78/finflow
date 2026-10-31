package com.finflow.service;

import com.finflow.entity.InviteCode;
import com.finflow.repository.InviteCodeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

/**
 * Who may sign up, set by SIGNUP_MODE (app.signup.mode):
 *   invite (default) — /auth/register needs an unused code an admin created on /admin
 *   open             — anyone can sign up
 *   closed           — nobody can
 * Codes are 12 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX-XXXX.
 * Typed codes are normalised (case, spaces and dashes ignored), so "abcd efgh-jkmn" works.
 */
@Service
@RequiredArgsConstructor
public class InviteService {

    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final InviteCodeRepository repository;

    @Value("${app.signup.mode:invite}")
    private String mode;

    public String mode() {
        String m = mode == null ? "" : mode.trim().toLowerCase(Locale.ROOT);
        return m.equals("open") || m.equals("closed") ? m : "invite";   // anything unrecognised fails safe
    }

    /** Throws unless this sign-up may go ahead; in invite mode it uses up the code. Call inside the sign-up transaction. */
    public void admit(String typedCode, String email) {
        switch (mode()) {
            case "open" -> { }
            case "closed" -> throw new RuntimeException("Sign-up is closed");
            default -> {
                String code = normalise(typedCode);
                if (code.isEmpty() || repository.claim(code, email, LocalDateTime.now()) != 1)
                    throw new RuntimeException("That invite code isn't valid or has already been used");
            }
        }
    }

    public InviteCode create(String note, String createdBy) {
        String code;
        do { code = randomCode(); } while (repository.existsByCode(code));
        String n = note == null ? null : note.trim();
        return repository.save(InviteCode.builder()
                .code(code)
                .note(n == null || n.isEmpty() ? null : n.length() > 120 ? n.substring(0, 120) : n)
                .createdBy(createdBy)
                .createdAt(LocalDateTime.now())
                .build());
    }

    public List<InviteCode> list() { return repository.findAllByOrderByCreatedAtDesc(); }

    /** Deletes an unused code. A used one stays as the record of who joined with it. */
    public void revoke(Long id) {
        InviteCode c = repository.findById(id).orElseThrow(() -> new RuntimeException("Invite not found"));
        if (c.getUsedAt() != null) throw new RuntimeException("This invite has already been used");
        repository.delete(c);
    }

    static String normalise(String typed) {
        return typed == null ? "" : typed.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    private static String randomCode() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
