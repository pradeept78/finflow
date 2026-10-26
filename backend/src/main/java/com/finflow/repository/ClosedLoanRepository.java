package com.finflow.repository;
import com.finflow.entity.ClosedLoan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ClosedLoanRepository extends JpaRepository<ClosedLoan, Long> {
    List<ClosedLoan> findByUserId(Long userId);
    Optional<ClosedLoan> findByIdAndUserId(Long id, Long userId);
}
