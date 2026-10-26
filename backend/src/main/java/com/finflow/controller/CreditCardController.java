package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.CreditCard;
import com.finflow.service.CreditCardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/credit-cards")
@RequiredArgsConstructor
public class CreditCardController {
    private final CreditCardService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<CreditCard>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CreditCard>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CreditCard>> create(@RequestBody CreditCard entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CreditCard>> update(@PathVariable Long id, @RequestBody CreditCard entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @PatchMapping("/{cardId}/emis/{emiId}/mark-paid")
    public ResponseEntity<ApiResponse<CreditCard>> markEmiPaid(@PathVariable Long cardId, @PathVariable Long emiId) {
        return ResponseEntity.ok(ApiResponse.ok("EMI marked paid", service.markEmiPaid(cardId, emiId)));
    }

    @PostMapping("/{cardId}/emis")
    public ResponseEntity<ApiResponse<CreditCard>> addEmi(@PathVariable Long cardId, @RequestBody com.finflow.entity.CardEmi emi) {
        return ResponseEntity.ok(ApiResponse.ok("EMI added", service.addEmi(cardId, emi)));
    }

    @PostMapping("/{cardId}/spends")
    public ResponseEntity<ApiResponse<CreditCard>> addSpend(@PathVariable Long cardId, @RequestBody com.finflow.entity.CardSpend spend) {
        return ResponseEntity.ok(ApiResponse.ok("Spend added", service.addSpend(cardId, spend)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
