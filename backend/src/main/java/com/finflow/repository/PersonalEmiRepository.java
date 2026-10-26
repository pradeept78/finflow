package com.finflow.repository;
import com.finflow.entity.PersonalEmi;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface PersonalEmiRepository extends JpaRepository<PersonalEmi, Long> {
    List<PersonalEmi> findByUserId(Long userId);
    Optional<PersonalEmi> findByIdAndUserId(Long id, Long userId);
}
