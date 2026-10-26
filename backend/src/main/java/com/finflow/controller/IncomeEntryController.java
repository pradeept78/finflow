package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.IncomeEntry;
import com.finflow.service.IncomeEntryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/income-entrys")
@RequiredArgsConstructor
public class IncomeEntryController {
    private final IncomeEntryService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<IncomeEntry>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<IncomeEntry>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<IncomeEntry>> create(@RequestBody IncomeEntry entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<IncomeEntry>> update(@PathVariable Long id, @RequestBody IncomeEntry entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
