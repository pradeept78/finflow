package com.finflow.repository;
import com.finflow.entity.PeopleOwe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface PeopleOweRepository extends JpaRepository<PeopleOwe, Long> {
    List<PeopleOwe> findByUserId(Long userId);
    Optional<PeopleOwe> findByIdAndUserId(Long id, Long userId);
}
