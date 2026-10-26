package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.CardEmi;
import com.finflow.entity.User;
import com.finflow.repository.CardEmiRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/card-emis")
@RequiredArgsConstructor
public class CardEmiController {

    private final CardEmiRepository repo;
    private final UserRepository userRepository;

    // Was missing entirely: update/delete below used to go straight through repo.findById(id) /
    // repo.deleteById(id) with no ownership check at all, so any authenticated user could edit or
    // delete any other user's card EMI just by guessing/incrementing an id. CardEmi has no user_id
    // of its own — it belongs to a CreditCard which belongs to a User — so the check goes through
    // the parent card via CardEmiRepository.findByIdAndCard_User_Id.
    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CardEmi>> update(@PathVariable Long id, @RequestBody CardEmi updated) {
        CardEmi existing = repo.findByIdAndCard_User_Id(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("EMI not found"));
        if (updated.getLabel() != null) existing.setLabel(updated.getLabel());
        if (updated.getEmi() != null) existing.setEmi(updated.getEmi());
        if (updated.getTenure() != null) existing.setTenure(updated.getTenure());
        if (updated.getPrincipal() != null) existing.setPrincipal(updated.getPrincipal());
        if (updated.getStartDate() != null) existing.setStartDate(updated.getStartDate());
        if (updated.getEndDate() != null) existing.setEndDate(updated.getEndDate());
        if (updated.getMissedMonths() != null) existing.setMissedMonths(updated.getMissedMonths());
        // Was missing — InsurancePage.tsx's inline "Card — EMI" flow PUTs here on every edit after
        // the first link, and CreditCardsPage.tsx's own EMI edit form added a Category field too;
        // both silently had no effect on an existing EMI without this line (create already worked,
        // since that path saves the whole deserialized object rather than copying field by field).
        if (updated.getCategory() != null) existing.setCategory(updated.getCategory());
        if (updated.getOwedBy() != null) existing.setOwedBy(updated.getOwedBy().isBlank() ? null : updated.getOwedBy());
        if (updated.getOwedSettled() != null) existing.setOwedSettled(updated.getOwedSettled());
        return ResponseEntity.ok(ApiResponse.ok("Updated", repo.save(existing)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        CardEmi existing = repo.findByIdAndCard_User_Id(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("EMI not found"));
        repo.delete(existing);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
