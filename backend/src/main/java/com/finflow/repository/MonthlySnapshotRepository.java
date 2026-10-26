package com.finflow.repository;

import com.finflow.entity.MonthlySnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface MonthlySnapshotRepository extends JpaRepository<MonthlySnapshot, Long> {
    List<MonthlySnapshot> findByUserIdOrderByMonthYearDesc(Long userId);
    Optional<MonthlySnapshot> findByUserIdAndMonthYear(Long userId, String monthYear);
    List<MonthlySnapshot> findTop6ByUserIdOrderByMonthYearDesc(Long userId);
}
