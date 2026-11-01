package com.finflow.messages;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Where the iPhone Shortcut sends bank SMS: POST /api/ingest/sms with header X-FinFlow-Key and a JSON
 * body {"sender": "...", "text": "..."}. There is no sign-in session on a Shortcut, so this path is
 * public (SecurityConfig) and the personal key is the authentication: it only ever adds messages to
 * the review list of the user it belongs to, and can be turned off from the app.
 */
@RestController
@RequestMapping("/ingest")
@RequiredArgsConstructor
public class IngestController {

    private final BankMessageService service;

    @PostMapping("/sms")
    public ResponseEntity<ApiResponse<Map<String, String>>> sms(@RequestHeader(value = "X-FinFlow-Key", required = false) String key,
                                                             @RequestBody(required = false) Map<String, String> body) {
        User user = service.userForKey(key);
        if (user == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("Unknown key. Create a new one in FinFlow → Bank messages."));
        if (body == null || body.get("text") == null)
            return ResponseEntity.badRequest().body(ApiResponse.error("Send {\"text\": \"the message\"}"));
        BankMessage m = service.ingest(user, "sms", body.get("sender"), body.get("text"), LocalDateTime.now());
        // Short and boring on purpose: the Shortcut can show it as a notification.
        String what = switch (m.getKind()) {
            case CARD_SPEND -> "card spend";
            case CARD_STATEMENT -> "card bill";
            case CARD_PAYMENT -> "card payment";
            case CARD_EMI -> "new card EMI";
            case EMI_DEBIT -> "loan EMI";
            case IGNORED -> "ignored";
            default -> "not recognised";
        };
        return ResponseEntity.ok(ApiResponse.ok("FinFlow: " + what, Map.of("kind", m.getKind().name(), "status", m.getStatus().name())));
    }
}
