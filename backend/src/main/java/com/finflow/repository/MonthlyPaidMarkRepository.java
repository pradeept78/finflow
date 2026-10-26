package com.finflow.repository;
import com.finflow.entity.MonthlyPaidMark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface MonthlyPaidMarkRepository extends JpaRepository<MonthlyPaidMark, Long> {
    List<MonthlyPaidMark> findByUserIdAndMonthYear(Long userId, String monthYear);
    Optional<MonthlyPaidMark> findByUserIdAndItemKeyAndMonthYear(Long userId, String itemKey, String monthYear);
    boolean existsByUserIdAndItemKeyAndMonthYear(Long userId, String itemKey, String monthYear);
    @Modifying
    @Query("DELETE FROM MonthlyPaidMark m WHERE m.user.id = :userId AND m.monthYear = :monthYear AND m.itemKey = :itemKey")
    void deleteByUserIdAndItemKeyAndMonthYear(@Param("userId") Long userId, @Param("itemKey") String itemKey, @Param("monthYear") String monthYear);
}
