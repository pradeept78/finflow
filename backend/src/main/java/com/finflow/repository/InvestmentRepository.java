package com.finflow.repository;
import com.finflow.entity.Investment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface InvestmentRepository extends JpaRepository<Investment, Long> {
    List<Investment> findByUserId(Long userId);
    Optional<Investment> findByIdAndUserId(Long id, Long userId);
}
