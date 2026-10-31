package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.service.MonthlyPaidMarkService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/paid-marks")
@RequiredArgsConstructor
public class MonthlyPaidMarkController {

    private final MonthlyPaidMarkService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<String>>> getMarked(@RequestParam(required = false) String month) {
        return ResponseEntity.ok(ApiResponse.ok(service.getMarkedItems(month)));
    }

    @PostMapping("/toggle")
    public ResponseEntity<ApiResponse<Boolean>> toggle(@RequestBody Map<String, String> body) {
        // Optional "monthYear": tick a bill for the month it is due in (defaults to the current month)
        boolean marked = service.toggle(body.get("itemKey"), body.get("monthYear"));
        return ResponseEntity.ok(ApiResponse.ok(marked ? "Marked paid" : "Unmarked", marked));
    }
}
