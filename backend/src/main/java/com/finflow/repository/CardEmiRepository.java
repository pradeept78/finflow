package com.finflow.repository;
import com.finflow.entity.CardEmi;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface CardEmiRepository extends JpaRepository<CardEmi, Long> {
    // Ownership check goes through the parent card, since CardEmi has no user_id of its own —
    // it belongs to a CreditCard which belongs to a User. Without this, update/delete by id alone
    // let any authenticated user touch any other user's EMI (see CardEmiController).
    Optional<CardEmi> findByIdAndCard_User_Id(Long id, Long userId);
}
