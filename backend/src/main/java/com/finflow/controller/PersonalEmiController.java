package com.finflow.controller;
import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.PersonalEmi;
import com.finflow.service.PersonalEmiService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/personal-emis")
@RequiredArgsConstructor
public class PersonalEmiController {
    private final PersonalEmiService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PersonalEmi>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(service.getAll()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PersonalEmi>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PersonalEmi>> create(@RequestBody PersonalEmi entity) {
        return ResponseEntity.ok(ApiResponse.ok("Created", service.create(entity)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<PersonalEmi>> update(@PathVariable Long id, @RequestBody PersonalEmi entity) {
        return ResponseEntity.ok(ApiResponse.ok("Updated", service.update(id, entity)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Deleted", null));
    }
}
