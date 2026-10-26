package com.finflow.controller;

import com.finflow.dto.response.ApiResponse;
import com.finflow.entity.MonthlySnapshot;
import com.finflow.entity.User;
import com.finflow.repository.UserRepository;
import com.finflow.service.SnapshotService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/snapshots")
@RequiredArgsConstructor
public class SnapshotController {

    private final SnapshotService snapshotService;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<MonthlySnapshot>>> getAll() {
        return ResponseEntity.ok(ApiResponse.ok(snapshotService.getAll(currentUser().getId())));
    }

    @GetMapping("/last6")
    public ResponseEntity<ApiResponse<List<MonthlySnapshot>>> getLast6() {
        return ResponseEntity.ok(ApiResponse.ok(snapshotService.getLast6Months(currentUser().getId())));
    }

    // Manual generate = CURRENT month (overwrite if exists)
    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<MonthlySnapshot>> generate() {
        String thisMonth = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return ResponseEntity.ok(ApiResponse.ok("Snapshot generated",
                snapshotService.generateOrUpdate(currentUser(), thisMonth)));
    }

    @PostMapping("/generate/{monthYear}")
    public ResponseEntity<ApiResponse<MonthlySnapshot>> generateForMonth(@PathVariable String monthYear) {
        return ResponseEntity.ok(ApiResponse.ok("Snapshot generated",
                snapshotService.generateOrUpdate(currentUser(), monthYear)));
    }

    // Restore historical snapshots from a full-backup JSON export (see ExportPage's importFromJSON).
    // `user` on MonthlySnapshot is @JsonIgnore so it can't be spoofed from the request body.
    @PostMapping("/restore")
    public ResponseEntity<ApiResponse<Integer>> restore(@RequestBody List<MonthlySnapshot> snapshots) {
        return ResponseEntity.ok(ApiResponse.ok("Snapshots restored",
                snapshotService.restoreSnapshots(currentUser(), snapshots)));
    }
}
