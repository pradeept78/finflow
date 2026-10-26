package com.finflow.repository;
import com.finflow.entity.IncomeEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface IncomeEntryRepository extends JpaRepository<IncomeEntry, Long> {
    List<IncomeEntry> findByUserId(Long userId);
    Optional<IncomeEntry> findByIdAndUserId(Long id, Long userId);
    Optional<IncomeEntry> findByUserIdAndIncomeType(Long userId, String incomeType);
}
