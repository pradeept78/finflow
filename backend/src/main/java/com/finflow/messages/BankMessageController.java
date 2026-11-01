package com.finflow.messages;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The signed-in user's bank messages: review list, paste one in, confirm / ignore, and the Shortcut key. */
@RestController
@RequestMapping("/bank-messages")
@RequiredArgsConstructor
public class BankMessageController {

    private final BankMessageService service;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<BankMessage>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(service.list(currentUser())));
    }

    /** For the Home banner: how many are waiting, and whether the Shortcut is set up. */
    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> summary() {
        User u = currentUser();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("newCount", service.countNew(u));
        body.put("hasKey", service.hasIngestKey(u));
        body.put("autoAdd", !Boolean.FALSE.equals(u.getAutoAddMessages()));
        body.put("autoAddedRecent", service.countAutoAddedSince(u, LocalDateTime.now().minusDays(3)));
        return ResponseEntity.ok(ApiResponse.ok(body));
    }

    /** A message pasted into the app (any bank SMS or alert email text). */
    @PostMapping("/paste")
    public ResponseEntity<ApiResponse<BankMessage>> paste(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.ingest(currentUser(), "paste", body.get("sender"), body.get("text"), LocalDateTime.now())));
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<ApiResponse<BankMessage>> confirm(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> edits) {
        return ResponseEntity.ok(ApiResponse.ok(service.confirm(currentUser(), id, edits)));
    }

    @PostMapping("/{id}/undo")
    public ResponseEntity<ApiResponse<BankMessage>> undo(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok("Undone", service.undo(currentUser(), id)));
    }

    /** Auto-add on/off. */
    @PutMapping("/settings")
    public ResponseEntity<ApiResponse<String>> settings(@RequestBody Map<String, Boolean> body) {
        service.setAutoAdd(currentUser(), !Boolean.FALSE.equals(body.get("autoAdd")));
        return ResponseEntity.ok(ApiResponse.ok("Saved", "ok"));
    }

    @PostMapping("/{id}/ignore")
    public ResponseEntity<ApiResponse<BankMessage>> ignore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.ignore(currentUser(), id)));
    }

    /** "Confirm all": every NEW message FinFlow is sure about. Ones that fail stay NEW. */
    @PostMapping("/confirm-sure")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> confirmSure() {
        User u = currentUser();
        int done = 0, failed = 0;
        for (BankMessage m : service.list(u)) {
            if (m.getStatus() != BankMessage.Status.NEW || !m.isSure()) continue;
            try { service.confirm(u, m.getId(), null); done++; } catch (RuntimeException e) { failed++; }
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of("confirmed", done, "failed", failed)));
    }

    /** A new key for the iPhone Shortcut. Shown once; replaces the old one. */
    @PostMapping("/key")
    public ResponseEntity<ApiResponse<String>> newKey() {
        return ResponseEntity.ok(ApiResponse.ok("New key created", service.newIngestKey(currentUser())));
    }

    @DeleteMapping("/key")
    public ResponseEntity<ApiResponse<String>> revokeKey() {
        service.revokeIngestKey(currentUser());
        return ResponseEntity.ok(ApiResponse.ok("Key turned off", "ok"));
    }
}
