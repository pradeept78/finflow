package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.CardSpend;
import com.finflow.entity.User;
import com.finflow.repository.CardSpendRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/card-spends")
@RequiredArgsConstructor
public class CardSpendController {

    private final CardSpendRepository repo;
    private final UserRepository userRepository;

    // Was missing entirely: delete used to go straight through repo.deleteById(id) with no
    // ownership check, so any authenticated user could delete any other user's spend record just
    // by guessing an id. Same fix pattern as CardEmiController.
    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    // Was missing entirely — spends could be created and deleted but never edited (e.g. to
    // correct the purpose/amount, or to tag/settle an "owed by a friend" spend). Same partial-
    // update + ownership-check pattern as CardEmiController.update.
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CardSpend>> update(@PathVariable Long id, @RequestBody CardSpend updated) {
        CardSpend existing = repo.findByIdAndCard_User_Id(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Spend not found"));
        if (updated.getPurpose() != null) existing.setPurpose(updated.getPurpose());
        if (updated.getAmount() != null) existing.setAmount(updated.getAmount());
        if (updated.getSpendDate() != null) existing.setSpendDate(updated.getSpendDate());
        if (updated.getCategory() != null) existing.setCategory(updated.getCategory());
        if (updated.getOwedBy() != null) existing.setOwedBy(updated.getOwedBy().isBlank() ? null : updated.getOwedBy());
        if (updated.getOwedSettled() != null) existing.setOwedSettled(updated.getOwedSettled());
        return ResponseEntity.ok(ApiResponse.ok("Updated", repo.save(existing)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        CardSpend existing = repo.findByIdAndCard_User_Id(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Spend not found"));
        repo.delete(existing);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
