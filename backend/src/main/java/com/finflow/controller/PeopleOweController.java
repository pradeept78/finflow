package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.PeopleOwe;
import com.finflow.service.PeopleOweService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/people-owes")
@RequiredArgsConstructor
public class PeopleOweController {
    private final PeopleOweService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PeopleOwe>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PeopleOwe>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PeopleOwe>> create(@RequestBody PeopleOwe entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<PeopleOwe>> update(@PathVariable Long id, @RequestBody PeopleOwe entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
