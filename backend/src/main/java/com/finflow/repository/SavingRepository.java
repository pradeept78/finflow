package com.finflow.repository;
import com.finflow.entity.Saving;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface SavingRepository extends JpaRepository<Saving, Long> {
    List<Saving> findByUserId(Long userId);
    Optional<Saving> findByIdAndUserId(Long id, Long userId);
}
