package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.Loan;
import com.finflow.service.LoanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/loans")
@RequiredArgsConstructor
public class LoanController {

    private final LoanService loanService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Loan>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(loanService.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Loan>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(loanService.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Loan>> create(@RequestBody Loan loan) {
        return ResponseEntity.ok(ApiResponse.ok("Loan created", loanService.create(loan)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Loan>> update(@PathVariable Long id, @RequestBody Loan loan) {
        return ResponseEntity.ok(ApiResponse.ok("Loan updated", loanService.update(id, loan)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        loanService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Loan deleted", null));
    }
}
