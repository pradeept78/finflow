package com.finflow.repository;
import com.finflow.entity.CardSpend;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface CardSpendRepository extends JpaRepository<CardSpend, Long> {
    // Same ownership-via-parent-card reasoning as CardEmiRepository.findByIdAndCard_User_Id.
    Optional<CardSpend> findByIdAndCard_User_Id(Long id, Long userId);
}
