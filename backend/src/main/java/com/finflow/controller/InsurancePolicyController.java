package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.InsurancePolicy;
import com.finflow.service.InsurancePolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/insurance-policys")
@RequiredArgsConstructor
public class InsurancePolicyController {
    private final InsurancePolicyService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<InsurancePolicy>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<InsurancePolicy>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<InsurancePolicy>> create(@RequestBody InsurancePolicy entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<InsurancePolicy>> update(@PathVariable Long id, @RequestBody InsurancePolicy entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
