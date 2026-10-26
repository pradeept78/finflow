package com.finflow.repository;

import com.finflow.entity.Earning;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface EarningRepository extends JpaRepository<Earning, Long> {
    List<Earning> findByUserId(Long userId);
    Optional<Earning> findByIdAndUserId(Long id, Long userId);
}
