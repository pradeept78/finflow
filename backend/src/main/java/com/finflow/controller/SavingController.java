package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.Saving;
import com.finflow.service.SavingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/savings")
@RequiredArgsConstructor
public class SavingController {
    private final SavingService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Saving>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Saving>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Saving>> create(@RequestBody Saving entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Saving>> update(@PathVariable Long id, @RequestBody Saving entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
