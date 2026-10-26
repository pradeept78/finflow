package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.ClosedLoan;
import com.finflow.service.ClosedLoanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/closed-loans")
@RequiredArgsConstructor
public class ClosedLoanController {
    private final ClosedLoanService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<ClosedLoan>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ClosedLoan>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ClosedLoan>> create(@RequestBody ClosedLoan entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ClosedLoan>> update(@PathVariable Long id, @RequestBody ClosedLoan entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
