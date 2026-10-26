package com.finflow.repository;
import com.finflow.entity.InsurancePolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface InsurancePolicyRepository extends JpaRepository<InsurancePolicy, Long> {
    List<InsurancePolicy> findByUserId(Long userId);
    Optional<InsurancePolicy> findByIdAndUserId(Long id, Long userId);
}
